"""管理员管理（超管）：列表 / 任命 / 解除。

规则：
  - 任命：已有账号（如学生）直接升 role=admin；新账号需提供初始密码
  - 解除：绑定学生的降回 user（保留账号），纯管理员账号删除
  - .env 配置的 SUPERADMIN_ID 不可被解除（effective_role 永不锁死）
"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request

from ..db import get_db
from ..deps import client_ip, require_superadmin
from ..schemas import AdminIn
from ..services import audit
from ..services.security import hash_password
from ..settings import settings

router = APIRouter(prefix="/admins", tags=["admins"])


@router.get("")
def list_admins(conn: sqlite3.Connection = Depends(get_db),
                user: dict = Depends(require_superadmin)):
    rows = conn.execute(
        """
        SELECT u.id, u.role, u.display_name, u.student_id, u.last_login_at,
               u.created_at, s.name AS student_name
        FROM users u LEFT JOIN student s ON s.id = u.student_id
        WHERE u.role IN ('admin', 'superadmin') OR u.id = ?
        ORDER BY u.role DESC, u.id
        """,
        (settings.superadmin_id,),
    ).fetchall()
    out = []
    for r in rows:
        role = "superadmin" if r["id"] == settings.superadmin_id else r["role"]
        out.append({"id": r["id"], "role": role,
                    "name": r["display_name"] or r["student_name"] or r["id"],
                    "studentId": r["student_id"],
                    "lastLoginAt": r["last_login_at"], "createdAt": r["created_at"]})
    return out


@router.post("", status_code=201)
def appoint(body: AdminIn, request: Request,
            conn: sqlite3.Connection = Depends(get_db),
            user: dict = Depends(require_superadmin)):
    existing = conn.execute("SELECT id, role FROM users WHERE id = ?", (body.id,)).fetchone()
    with conn:
        if existing:
            if existing["role"] != "user":
                raise HTTPException(409, f"{body.id} 已是 {existing['role']}")
            conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (body.id,))
            mode = "promoted"
        else:
            if not body.password or len(body.password) < 8:
                raise HTTPException(422, "新管理员账号需提供至少 8 位初始密码")
            conn.execute(
                """
                INSERT INTO users (id, password_hash, role, display_name,
                                   must_change_password)
                VALUES (?, ?, 'admin', ?, 1)
                """,
                (body.id, hash_password(body.password), body.name),
            )
            mode = "created"
        audit.log(conn, user["id"], "admin.appoint", body.id,
                  {"mode": mode}, client_ip(request))
    return {"id": body.id, "role": "admin", "mode": mode}


@router.delete("/{admin_id}", status_code=204)
def dismiss(admin_id: str, request: Request,
            conn: sqlite3.Connection = Depends(get_db),
            user: dict = Depends(require_superadmin)):
    if admin_id == settings.superadmin_id:
        raise HTTPException(403, "不能解除 .env 配置的超级管理员")
    if admin_id == user["id"]:
        raise HTTPException(403, "不能解除自己")
    row = conn.execute(
        "SELECT id, role, student_id FROM users WHERE id = ?", (admin_id,)
    ).fetchone()
    if row is None or row["role"] == "user":
        raise HTTPException(404, "该账号不是管理员")
    with conn:
        if row["student_id"]:
            conn.execute("UPDATE users SET role = 'user' WHERE id = ?", (admin_id,))
            mode = "demoted"
        else:
            conn.execute("DELETE FROM users WHERE id = ?", (admin_id,))
            mode = "deleted"
        audit.log(conn, user["id"], "admin.dismiss", admin_id,
                  {"mode": mode}, client_ip(request))
