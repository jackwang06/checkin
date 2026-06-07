"""假条审批（管理员）：列表 / 批准·驳回·撤销 / 附件。

审批语义（与计划文档一致）：
  - pending → approved：写考勤（已开周日期），未开周日期记 pendingDates 等开周回填
  - pending → rejected：仅改状态
  - approved → rejected：改判，按 applied_dates 还原「无异常」
"""

import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from ..db import get_db
from ..deps import client_ip, require_admin
from ..schemas import LeaveReviewIn
from ..services import audit
from ..settings import settings
from .me import leave_out

router = APIRouter(prefix="/leave-requests", tags=["leaves"])


@router.get("")
def list_leaves(status: str | None = None, page: int = 1, page_size: int = 20,
                conn: sqlite3.Connection = Depends(get_db),
                user: dict = Depends(require_admin)):
    where, params = "", []
    if status:
        where, params = "WHERE l.status = ?", [status]
    total = conn.execute(
        f"SELECT COUNT(*) FROM leave_request l {where}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"""
        SELECT l.*, s.name AS student_name, c.full_name AS class_name
        FROM leave_request l
        JOIN student s ON s.id = l.student_id
        JOIN class c   ON c.id = s.class_id
        {where}
        ORDER BY CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.created_at DESC
        LIMIT ? OFFSET ?
        """,
        [*params, min(page_size, 100), (max(page, 1) - 1) * page_size],
    ).fetchall()
    items = []
    for r in rows:
        item = leave_out(r)
        item["studentName"] = r["student_name"]
        item["className"] = r["class_name"]
        items.append(item)
    return {"items": items, "total": total}


@router.post("/{leave_id}/review")
def review(leave_id: int, body: LeaveReviewIn, request: Request,
           conn: sqlite3.Connection = Depends(get_db),
           user: dict = Depends(require_admin)):
    from leave_backfill import apply_leave, revert_leave   # scripts/ 共享模块

    if body.decision not in ("approved", "rejected"):
        raise HTTPException(422, "decision 只能是 approved 或 rejected")
    row = conn.execute("SELECT * FROM leave_request WHERE id = ?", (leave_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "假条不存在")

    # 学生姓名/班级（审计可读性）
    stu = conn.execute(
        "SELECT s.name, c.full_name FROM student s JOIN class c ON c.id = s.class_id "
        "WHERE s.id = ?", (row["student_id"],),
    ).fetchone()

    report: dict = {}
    with conn:
        if row["status"] == "pending":
            if body.decision == "approved":
                report = apply_leave(conn, dict(row))
                action = "leave.approve"
            else:
                action = "leave.reject"
        elif row["status"] == "approved" and body.decision == "rejected":
            # 改判：还原已写入的考勤
            report = {"reverted": revert_leave(conn, dict(row))}
            action = "leave.revert"
        else:
            raise HTTPException(409, f"假条当前状态为 {row['status']}，不能执行该操作")

        conn.execute(
            """
            UPDATE leave_request
            SET status = ?, reviewed_by = ?, reviewed_at = datetime('now','localtime'),
                review_comment = ?
            WHERE id = ?
            """,
            (body.decision, user["id"], body.comment, leave_id),
        )
        audit.log(conn, user["id"], action, f"leave:{leave_id}",
                  {"studentId": row["student_id"],
                   "studentName": stu["name"] if stu else None,
                   "className": stu["full_name"] if stu else None,
                   "type": row["type"], "decision": body.decision,
                   "comment": body.comment, **report},
                  client_ip(request))

    out = leave_out(conn.execute(
        "SELECT * FROM leave_request WHERE id = ?", (leave_id,)).fetchone())
    out["report"] = {
        "applied": report.get("applied", []),
        "pendingDates": report.get("skipped_no_week", []),
        "overwritten": report.get("overwritten", []),
        "reverted": report.get("reverted", []),
    }
    return out


@router.get("/{leave_id}/attachment")
def attachment(leave_id: int,
               conn: sqlite3.Connection = Depends(get_db),
               user: dict = Depends(require_admin)):
    row = conn.execute(
        "SELECT attachment_path FROM leave_request WHERE id = ?", (leave_id,)
    ).fetchone()
    if row is None or not row["attachment_path"]:
        raise HTTPException(404, "附件不存在")
    path = settings.uploads_dir / Path(row["attachment_path"]).name
    if not path.exists():
        raise HTTPException(404, "附件文件丢失")
    return FileResponse(path)
