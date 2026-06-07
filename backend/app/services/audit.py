"""审计日志：所有写操作必经此处，与业务写同一事务（业务回滚则日志回滚）。"""

import json
import sqlite3


def log(conn: sqlite3.Connection, user_id: str, action: str,
        target: str | None = None, detail: dict | None = None,
        ip: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_log (user_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)",
        (user_id, action, target,
         json.dumps(detail, ensure_ascii=False) if detail is not None else None, ip),
    )
