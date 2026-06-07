"""学籍变动：转班/降级/转专业（管理员，复用 scripts/transfer.py）。"""

import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request

from ..db import get_db
from ..deps import client_ip, require_admin
from ..schemas import TransferIn
from ..services import audit

router = APIRouter(prefix="/transfers", tags=["transfers"])


@router.post("", status_code=201)
def create_transfer(body: TransferIn, request: Request,
                    conn: sqlite3.Connection = Depends(get_db),
                    user: dict = Depends(require_admin)):
    from transfer import do_transfer   # scripts/ 共享模块

    eff = body.date or date.today().isoformat()
    try:
        with conn:
            r = do_transfer(conn, body.student_id, body.to_class_full_name, eff)
            audit.log(conn, user["id"], "transfer", body.student_id,
                      {"kind": r["kind"], "from": r["from"]["full_name"],
                       "to": r["to"]["full_name"], "date": eff},
                      client_ip(request))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"studentId": r["student_id"], "name": r["name"], "kind": r["kind"],
            "from": r["from"]["full_name"], "to": r["to"]["full_name"],
            "date": r["date"]}
