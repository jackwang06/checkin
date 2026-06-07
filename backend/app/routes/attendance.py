"""考勤批改：单格 / 批量 UPSERT（管理员，全量审计）。"""

import sqlite3

from fastapi import APIRouter, Depends, Request

from ..db import get_db
from ..deps import client_ip, require_admin
from ..schemas import AttendanceBatch, AttendancePatch
from ..services import audit
from ..services.attendance import upsert_cell

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.patch("")
def patch_cell(body: AttendancePatch, request: Request,
               conn: sqlite3.Connection = Depends(get_db),
               user: dict = Depends(require_admin)):
    with conn:
        r = upsert_cell(conn, body.student_id, body.date, body.status,
                        body.reason, body.return_date)
        audit.log(conn, user["id"], "attendance.update",
                  f"{body.student_id}:{body.date}",
                  {"from": r["old"], "to": r["new"], "reason": body.reason,
                   "returnDate": body.return_date},
                  client_ip(request))
    return {"studentId": body.student_id, "date": body.date,
            "old": r["old"], "status": r["new"]}


@router.patch("/batch")
def patch_batch(body: AttendanceBatch, request: Request,
                conn: sqlite3.Connection = Depends(get_db),
                user: dict = Depends(require_admin)):
    ip = client_ip(request)
    results = []
    with conn:                      # 单事务：要么全成，要么全回滚（含审计）
        for item in body.items:
            r = upsert_cell(conn, item.student_id, item.date, item.status,
                            item.reason, item.return_date)
            audit.log(conn, user["id"], "attendance.update",
                      f"{item.student_id}:{item.date}",
                      {"from": r["old"], "to": r["new"], "batch": True}, ip)
            results.append({"studentId": item.student_id, "date": item.date,
                            "old": r["old"], "status": r["new"]})
    return {"updated": len(results), "items": results}
