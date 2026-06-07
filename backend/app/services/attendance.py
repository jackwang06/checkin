"""考勤格子 UPSERT：周校验 / 拒周六 / 拒周外日期 / 状态字典校验。

与 CLI 的 sql.py 裸 SQL 不同，Web 端写格子必须走这里——保证
「改不存在的行」自动落为插入（解析 week_id），且所有防呆前置。
"""

import sqlite3
from datetime import date as date_cls

from fastapi import HTTPException

from rollcall import reject_reason   # scripts/ 共享模块

# 人工不可设置的系统状态
SYSTEM_STATUSES = {"节假日"}


def upsert_cell(conn: sqlite3.Connection, student_id: str, date: str,
                status: str, reason: str | None,
                return_date: str | None) -> dict:
    """返回 {old, new, studentName, className}。调用方负责事务与审计。"""
    try:
        date_cls.fromisoformat(date)
    except ValueError:
        raise HTTPException(422, f"日期格式错误: {date}")

    stu = conn.execute(
        """
        SELECT s.name, c.full_name FROM student s
        JOIN class c ON c.id = s.class_id WHERE s.id = ?
        """,
        (student_id,),
    ).fetchone()
    if stu is None:
        raise HTTPException(404, f"学号 {student_id} 不存在")

    if status in SYSTEM_STATUSES:
        raise HTTPException(422, f"{status} 是系统状态，不能手动设置（请用「特殊日期」管理）")
    if conn.execute("SELECT 1 FROM status_def WHERE code = ?", (status,)).fetchone() is None:
        valid = [r[0] for r in conn.execute(
            "SELECT code FROM status_def WHERE code NOT IN ('节假日') ORDER BY sort_order")]
        raise HTTPException(422, f"状态 {status!r} 无效，可选: {'/'.join(valid)}")

    reason_no = reject_reason(conn, date)
    if reason_no:
        raise HTTPException(422, reason_no)

    wk = conn.execute(
        "SELECT id FROM week WHERE ? BETWEEN start_date AND end_date", (date,)
    ).fetchone()
    if wk is None:
        raise HTTPException(409, f"{date} 所在周还未开周，请先在「管理→开周」创建该周")

    old = conn.execute(
        "SELECT status FROM attendance WHERE student_id = ? AND date = ?",
        (student_id, date),
    ).fetchone()
    if old and old[0] == "节假日":
        raise HTTPException(422, f"{date} 是节假日，不能修改考勤")
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
    return {"old": old["status"] if old else None, "new": status,
            "studentName": stu["name"], "className": stu["full_name"]}
