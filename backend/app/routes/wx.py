"""微信小程序登录 / 首次绑定。

流程：小程序 Taro.login() 拿 code →
  POST /wx/login {code}：openid 已绑定账号 → 直接发 token；未绑定 → {needBind:true}
  POST /wx/bind {code, id, password}：校验账号密码 → 绑定 openid → 发 token
"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request

from ..db import get_db
from ..deps import client_ip, load_user
from ..schemas import WxBindIn, WxLoginIn
from ..services import audit
from ..services.security import create_token, verify_password
from ..services.wx import code2session

router = APIRouter(prefix="/wx", tags=["wx"])


@router.post("/login")
def wx_login(body: WxLoginIn, conn: sqlite3.Connection = Depends(get_db)):
    openid = code2session(body.code)
    row = conn.execute("SELECT id FROM users WHERE wx_openid = ?", (openid,)).fetchone()
    if row is None:
        return {"needBind": True}
    with conn:
        conn.execute(
            "UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?",
            (row["id"],),
        )
    return {"needBind": False, "user": load_user(conn, row["id"]),
            "token": create_token(row["id"])}


@router.post("/bind", status_code=201)
def wx_bind(body: WxBindIn, request: Request, conn: sqlite3.Connection = Depends(get_db)):
    openid = code2session(body.code)
    # openid 已绑别的账号？
    taken = conn.execute(
        "SELECT id FROM users WHERE wx_openid = ?", (openid,)
    ).fetchone()
    if taken and taken["id"] != body.id:
        raise HTTPException(409, "该微信已绑定其他账号")

    u = conn.execute(
        "SELECT id, password_hash FROM users WHERE id = ?", (body.id,)
    ).fetchone()
    if u is None or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "学号/账号或密码错误")

    with conn:
        conn.execute(
            "UPDATE users SET wx_openid = ?, last_login_at = datetime('now','localtime') "
            "WHERE id = ?",
            (openid, body.id),
        )
        audit.log(conn, body.id, "wx.bind", body.id, None, client_ip(request))
    return {"user": load_user(conn, body.id), "token": create_token(body.id)}
