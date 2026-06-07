"""账号管理：按学号/账号重置密码（管理员）。

权限：
  - admin 可重置 role=user 的账号
  - superadmin 可重置 user/admin/superadmin（.env 锚定的超管除外）
重置后：密码 = 账号 id 本身，must_change_password=1（强制改密）。
此操作属管理动作（非个人隐私），记审计 auth.reset_password。
"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request

from ..db import get_db
from ..deps import ROLE_ORDER, client_ip, require_admin
from ..services import audit
from ..services.security import hash_password
from ..settings import settings

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/{account_id}/reset-password")
def reset_password(account_id: str, request: Request,
                   conn: sqlite3.Connection = Depends(get_db),
                   actor: dict = Depends(require_admin)):
    target = conn.execute(
        "SELECT id, role, student_id FROM users WHERE id = ?", (account_id,)
    ).fetchone()
    if target is None:
        raise HTTPException(404, f"账号 {account_id} 不存在（学生须已建账号）")

    target_role = target["role"]
    if settings.superadmin_id and account_id == settings.superadmin_id:
        raise HTTPException(403, "系统锚定的超级管理员密码只能通过服务器 .env 管理")
    # admin 只能重置普通用户；superadmin 可重置任意（除上面锚定超管）
    if ROLE_ORDER[actor["role"]] < ROLE_ORDER["superadmin"] and target_role != "user":
        raise HTTPException(403, "仅超级管理员可重置管理员账号的密码")

    with conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
            (hash_password(account_id), account_id),
        )
        audit.log(conn, actor["id"], "auth.reset_password", account_id,
                  {"targetRole": target_role}, client_ip(request))
    return {"id": account_id, "reset": True,
            "note": "已重置为初始密码（= 账号本身），该账号下次登录需改密"}
