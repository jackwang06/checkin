"""时间轴：周列表（登录可见）/ 开周（管理员，自动回填已批假条）。"""

import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request

from ..db import get_db
from ..deps import client_ip, get_active_user, require_admin
from ..schemas import WeekIn
from ..services import audit

router = APIRouter(prefix="/weeks", tags=["weeks"])


@router.get("")
def list_weeks(term: str | None = None,
               conn: sqlite3.Connection = Depends(get_db),
               user: dict = Depends(get_active_user)):
    where, params = "", []
    if term:
        where, params = " WHERE term = ?", [term]
    rows = conn.execute(
        f"SELECT id, term, week_no, start_date, end_date FROM week{where} "
        f"ORDER BY term, week_no", params,
    ).fetchall()
    return [{"id": r["id"], "term": r["term"], "weekNo": r["week_no"],
             "startDate": r["start_date"], "endDate": r["end_date"]} for r in rows]


@router.post("", status_code=201)
def create_week(body: WeekIn, request: Request,
                conn: sqlite3.Connection = Depends(get_db),
                user: dict = Depends(require_admin)):
    from leave_backfill import backfill_approved_leaves   # scripts/ 共享模块
    from seed_week import seed

    try:
        start = date.fromisoformat(body.start)
    except ValueError:
        raise HTTPException(422, f"日期格式错误: {body.start}")
    try:
        with conn:
            r = seed(conn, body.term, body.week_no, start)
            backfilled = backfill_approved_leaves(conn, r["week_id"])
            audit.log(conn, user["id"], "week.create",
                      f"{body.term}#W{body.week_no}",
                      {"start": body.start, "inserted": r["inserted"],
                       "backfilled": backfilled},
                      client_ip(request))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {
        "id": r["week_id"], "term": r["term"], "weekNo": r["week_no"],
        "startDate": r["start"], "endDate": r["end"],
        "inserted": r["inserted"], "total": r["total"], "students": r["students"],
        "backfilledLeaves": backfilled,
    }
