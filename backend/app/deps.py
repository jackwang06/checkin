"""依赖注入：当前用户 / 角色守卫 / 客户端 IP。

角色规则：
  - effective_role：.env 配置的 SUPERADMIN_ID 永远是 superadmin（永不锁死范式，仿 Aurash）
  - must_change_password=1 的用户只能访问 /auth/*（前端会拦到改密页）
"""

import sqlite3

from fastapi import Depends, Header, HTTPException, Request

from .db import get_db
from .services.security import decode_token
from .settings import settings

ROLE_ORDER = {"user": 0, "admin": 1, "superadmin": 2}


def client_ip(request: Request) -> str:
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "")


def load_user(conn: sqlite3.Connection, user_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT u.id, u.role, u.student_id, u.display_name, u.must_change_password,
               s.name AS student_name, c.full_name AS class_name,
               g.name AS grade, m.name AS major
        FROM users u
        LEFT JOIN student s ON s.id = u.student_id
        LEFT JOIN class c   ON c.id = s.class_id
        LEFT JOIN grade g   ON g.id = c.grade_id
        LEFT JOIN major m   ON m.id = c.major_id
        WHERE u.id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    role = row["role"]
    if settings.superadmin_id and row["id"] == settings.superadmin_id:
        role = "superadmin"
    return {
        "id": row["id"],
        "role": role,
        "studentId": row["student_id"],
        "name": row["display_name"] or row["student_name"] or row["id"],
        "className": row["class_name"],
        "grade": row["grade"],
        "major": row["major"],
        "mustChangePassword": bool(row["must_change_password"]),
    }


def get_current_user(
    conn: sqlite3.Connection = Depends(get_db),
    authorization: str = Header(default=""),
) -> dict:
    """已登录用户（允许 must_change_password，供 /auth/* 使用）。"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "未登录")
    user_id = decode_token(authorization.removeprefix("Bearer ").strip())
    if not user_id:
        raise HTTPException(401, "登录已过期，请重新登录")
    user = load_user(conn, user_id)
    if user is None:
        raise HTTPException(401, "账号不存在")
    return user


def get_active_user(user: dict = Depends(get_current_user)) -> dict:
    """已登录且已完成强制改密的用户（业务端点统一用这个）。"""
    if user["mustChangePassword"]:
        raise HTTPException(403, "首次登录请先修改密码")
    return user


def require_admin(user: dict = Depends(get_active_user)) -> dict:
    if ROLE_ORDER[user["role"]] < ROLE_ORDER["admin"]:
        raise HTTPException(403, "需要管理员权限")
    return user


def require_superadmin(user: dict = Depends(get_active_user)) -> dict:
    if ROLE_ORDER[user["role"]] < ROLE_ORDER["superadmin"]:
        raise HTTPException(403, "需要超级管理员权限")
    return user
