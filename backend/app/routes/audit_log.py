"""审计日志查询（管理员）：谁批的、谁改的、改了什么。"""

import json
import sqlite3

from fastapi import APIRouter, Depends

from ..db import get_db
from ..deps import require_admin

router = APIRouter(prefix="/audit-log", tags=["audit"])


@router.get("")
def query(user_id: str | None = None, action: str | None = None,
          from_date: str | None = None, to_date: str | None = None,
          page: int = 1, page_size: int = 50,
          conn: sqlite3.Connection = Depends(get_db),
          current: dict = Depends(require_admin)):
    where, params = ["1=1"], []
    if user_id:
        where.append("a.user_id = ?")
        params.append(user_id)
    if action:
        where.append("a.action LIKE ?")
        params.append(f"{action}%")
    if from_date:
        where.append("a.created_at >= ?")
        params.append(from_date)
    if to_date:
        where.append("a.created_at < datetime(?, '+1 day')")
        params.append(to_date)
    cond = " AND ".join(where)

    total = conn.execute(
        f"SELECT COUNT(*) FROM audit_log a WHERE {cond}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"""
        SELECT a.id, a.user_id, a.action, a.target, a.detail, a.ip, a.created_at,
               COALESCE(u.display_name, s.name, a.user_id) AS operator_name
        FROM audit_log a
        LEFT JOIN users u ON u.id = a.user_id
        LEFT JOIN student s ON s.id = u.student_id
        WHERE {cond}
        ORDER BY a.id DESC LIMIT ? OFFSET ?
        """,
        [*params, min(page_size, 200), (max(page, 1) - 1) * page_size],
    ).fetchall()
    return {
        "total": total,
        "items": [{
            "id": r["id"], "userId": r["user_id"], "operatorName": r["operator_name"],
            "action": r["action"], "target": r["target"],
            "detail": json.loads(r["detail"]) if r["detail"] else None,
            "ip": r["ip"], "createdAt": r["created_at"],
        } for r in rows],
    }
