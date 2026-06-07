"""考勤格子 UPSERT：周校验 / 拒周六 / 拒周外日期 / 状态字典校验。

与 CLI 的 sql.py 裸 SQL 不同，Web 端写格子必须走这里——保证
「改不存在的行」自动落为插入（解析 week_id），且所有防呆前置。
"""

import sqlite3
from datetime import date as date_cls

from fastapi import HTTPException


def upsert_cell(conn: sqlite3.Connection, student_id: str, date: str,
                status: str, reason: str | None,
                return_date: str | None) -> dict:
    """返回 {old: str|None, new: str}。调用方负责事务与审计。"""
    try:
        d = date_cls.fromisoformat(date)
    except ValueError:
        raise HTTPException(422, f"日期格式错误: {date}")
    if d.weekday() == 5:
        raise HTTPException(422, f"{date} 是周六，晚点名不覆盖周六")

    if conn.execute("SELECT 1 FROM student WHERE id = ?", (student_id,)).fetchone() is None:
        raise HTTPException(404, f"学号 {student_id} 不存在")
    if conn.execute("SELECT 1 FROM status_def WHERE code = ?", (status,)).fetchone() is None:
        valid = [r[0] for r in conn.execute(
            "SELECT code FROM status_def ORDER BY sort_order")]
        raise HTTPException(422, f"状态 {status!r} 无效，可选: {'/'.join(valid)}")

    wk = conn.execute(
        "SELECT id FROM week WHERE ? BETWEEN start_date AND end_date", (date,)
    ).fetchone()
    if wk is None:
        raise HTTPException(409, f"{date} 所在周还未开周，请先在「管理→开周」创建该周")

    old = conn.execute(
        "SELECT status FROM attendance WHERE student_id = ? AND date = ?",
        (student_id, date),
    ).fetchone()
    conn.execute(
        """
        INSERT INTO attendance (student_id, date, week_id, status, reason, return_date,
                                updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
        ON CONFLICT(student_id, date) DO UPDATE SET
            status = excluded.status,
            reason = excluded.reason,
            return_date = excluded.return_date,
            updated_at = excluded.updated_at
        """,
        (student_id, date, wk["id"], status,
         reason or None, return_date or None),
    )
    return {"old": old["status"] if old else None, "new": status}
