"""学生端：我的考勤 / 假条申请与撤回 / 附件。"""

import sqlite3
import uuid
from pathlib import Path

from fastapi import (APIRouter, Depends, Form, HTTPException, Request,
                     UploadFile)
from fastapi.responses import FileResponse

from ..db import get_db
from ..deps import client_ip, get_active_user
from ..services import audit
from ..services.grids import abnormal_rows, student_week_rows
from ..settings import settings

router = APIRouter(prefix="/me", tags=["me"])

ALLOWED_UPLOAD = {  # content-type -> 扩展名
    "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf",
}


def leave_out(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "studentId": row["student_id"], "type": row["type"],
        "startDate": row["start_date"], "endDate": row["end_date"],
        "reason": row["reason"], "returnDate": row["return_date"],
        "hasAttachment": bool(row["attachment_path"]),
        "status": row["status"], "reviewedBy": row["reviewed_by"],
        "reviewedAt": row["reviewed_at"], "reviewComment": row["review_comment"],
        "appliedDates": row["applied_dates"], "createdAt": row["created_at"],
    }


def _require_student(user: dict) -> str:
    if not user["studentId"]:
        raise HTTPException(403, "该账号未关联学生学籍")
    return user["studentId"]


@router.get("/attendance")
def my_attendance(
    term: str | None = None, from_week: int | None = None,
    to_week: int | None = None,
    conn: sqlite3.Connection = Depends(get_db),
    user: dict = Depends(get_active_user),
):
    sid = _require_student(user)
    return {
        "grid": student_week_rows(conn, sid, term, from_week, to_week),
        "abnormal": abnormal_rows(conn, sid, term),
    }


@router.get("/leave-requests")
def my_leaves(conn: sqlite3.Connection = Depends(get_db),
              user: dict = Depends(get_active_user)):
    sid = _require_student(user)
    rows = conn.execute(
        "SELECT * FROM leave_request WHERE student_id = ? ORDER BY created_at DESC",
        (sid,),
    ).fetchall()
    return [leave_out(r) for r in rows]


@router.post("/leave-requests", status_code=201)
async def submit_leave(
    request: Request,
    type: str = Form(...),
    start_date: str = Form(..., alias="startDate"),
    end_date: str = Form(..., alias="endDate"),
    reason: str = Form(...),
    return_date: str | None = Form(None, alias="returnDate"),
    file: UploadFile | None = None,
    conn: sqlite3.Connection = Depends(get_db),
    user: dict = Depends(get_active_user),
):
    sid = _require_student(user)
    if type not in ("事假", "公假"):
        raise HTTPException(422, "假条类型只能是 事假 或 公假")
    for d in (start_date, end_date, return_date):
        if d and (len(d) != 10 or d[4] != "-" or d[7] != "-"):
            raise HTTPException(422, f"日期格式应为 YYYY-MM-DD: {d}")
    if end_date < start_date:
        raise HTTPException(422, "结束日期不能早于开始日期")
    if not reason.strip():
        raise HTTPException(422, "请填写事由")

    attachment_path = None
    if file is not None and file.filename:
        ext = ALLOWED_UPLOAD.get(file.content_type or "")
        if ext is None:
            raise HTTPException(422, "证明材料仅支持 jpg/png/pdf")
        data = await file.read()
        if len(data) > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(422, f"附件不能超过 {settings.max_upload_mb}MB")
        settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        attachment_path = f"leave_{uuid.uuid4().hex}{ext}"
        (settings.uploads_dir / attachment_path).write_bytes(data)

    with conn:
        cur = conn.execute(
            """
            INSERT INTO leave_request (student_id, type, start_date, end_date,
                                       reason, return_date, attachment_path)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (sid, type, start_date, end_date, reason.strip(), return_date,
             attachment_path),
        )
        leave_id = cur.lastrowid
        audit.log(conn, user["id"], "leave.submit", f"leave:{leave_id}",
                  {"type": type, "startDate": start_date, "endDate": end_date,
                   "hasAttachment": bool(attachment_path)},
                  client_ip(request))
    row = conn.execute("SELECT * FROM leave_request WHERE id = ?", (leave_id,)).fetchone()
    return leave_out(row)


@router.delete("/leave-requests/{leave_id}", status_code=204)
def cancel_leave(leave_id: int, request: Request,
                 conn: sqlite3.Connection = Depends(get_db),
                 user: dict = Depends(get_active_user)):
    sid = _require_student(user)
    row = conn.execute(
        "SELECT id, status FROM leave_request WHERE id = ? AND student_id = ?",
        (leave_id, sid),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "假条不存在")
    if row["status"] != "pending":
        raise HTTPException(409, "只能撤回待审批的假条；已批准的请联系管理员")
    with conn:
        conn.execute(
            "UPDATE leave_request SET status = 'cancelled' WHERE id = ?", (leave_id,)
        )
        audit.log(conn, user["id"], "leave.cancel", f"leave:{leave_id}",
                  None, client_ip(request))


@router.get("/leave-requests/{leave_id}/attachment")
def my_leave_attachment(leave_id: int,
                        conn: sqlite3.Connection = Depends(get_db),
                        user: dict = Depends(get_active_user)):
    sid = _require_student(user)
    row = conn.execute(
        "SELECT attachment_path FROM leave_request WHERE id = ? AND student_id = ?",
        (leave_id, sid),
    ).fetchone()
    if row is None or not row["attachment_path"]:
        raise HTTPException(404, "附件不存在")
    path = settings.uploads_dir / Path(row["attachment_path"]).name
    if not path.exists():
        raise HTTPException(404, "附件文件丢失")
    return FileResponse(path)
