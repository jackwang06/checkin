"""认证：登录（限速）/ 改密 / 当前用户。"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request

from ..db import get_db
from ..deps import client_ip, get_current_user, load_user
from ..schemas import ChangePasswordIn, LoginIn
from ..services import audit
from ..services.security import create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

RATE_WINDOW_MIN = 15
RATE_MAX_PER_ACCOUNT = 5     # 防爆破单个账号
RATE_MAX_PER_IP = 30         # 防单源扫号；放宽以免校园 NAT 后整楼被锁


def _rate_limited(conn: sqlite3.Connection, user_id: str, ip: str) -> bool:
    win = f"-{RATE_WINDOW_MIN} minutes"
    by_account = conn.execute(
        "SELECT COUNT(*) FROM login_event WHERE success = 0 "
        "AND created_at >= datetime('now', 'localtime', ?) AND user_id = ?",
        (win, user_id),
    ).fetchone()[0]
    if by_account >= RATE_MAX_PER_ACCOUNT:
        return True
    if not ip:
        return False
    by_ip = conn.execute(
        "SELECT COUNT(*) FROM login_event WHERE success = 0 "
        "AND created_at >= datetime('now', 'localtime', ?) AND ip = ?",
        (win, ip),
    ).fetchone()[0]
    return by_ip >= RATE_MAX_PER_IP


@router.post("/login", status_code=201)
def login(body: LoginIn, request: Request, conn: sqlite3.Connection = Depends(get_db)):
    ip = client_ip(request)
    ua = request.headers.get("user-agent", "")[:300]
    if _rate_limited(conn, body.id, ip):
        raise HTTPException(429, f"尝试过于频繁，请 {RATE_WINDOW_MIN} 分钟后再试")

    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE id = ?", (body.id,)
    ).fetchone()
    ok = row is not None and verify_password(body.password, row["password_hash"])

    with conn:
        conn.execute(
            "INSERT INTO login_event (user_id, success, ip, user_agent) VALUES (?, ?, ?, ?)",
            (body.id, int(ok), ip, ua),
        )
        if ok:
            conn.execute(
                "UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?",
                (body.id,),
            )
    if not ok:
        raise HTTPException(401, "学号/账号或密码错误")

    user = load_user(conn, body.id)
    return {"user": user, "token": create_token(body.id)}


@router.post("/change-password", status_code=204)
def change_password(
    body: ChangePasswordIn,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: dict = Depends(get_current_user),     # 允许 must_change 状态调用
):
    if len(body.new_password) < 8:
        raise HTTPException(422, "新密码至少 8 位")
    if body.new_password == user["id"]:
        raise HTTPException(422, "新密码不能与学号相同")
    row = conn.execute(
        "SELECT password_hash FROM users WHERE id = ?", (user["id"],)
    ).fetchone()
    if not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(401, "当前密码不正确")
    with conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
            (hash_password(body.new_password), user["id"]),
        )
        audit.log(conn, user["id"], "auth.change_password", user["id"],
                  None, client_ip(request))


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
