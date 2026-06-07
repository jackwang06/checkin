"""CSV 导出（管理员）：复用 scripts/export.py 的查询构造，三口径同 CLI。"""

import csv
import io
import sqlite3
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from ..db import get_db
from ..deps import client_ip, require_admin
from ..services import audit

router = APIRouter(prefix="/export", tags=["export"])


@router.get("")
def export_csv(request: Request,
               grade: str | None = None, class_name: str | None = None,
               term: str | None = None, week_no: int | None = None,
               conn: sqlite3.Connection = Depends(get_db),
               user: dict = Depends(require_admin)):
    from export import build_query   # scripts/ 共享模块

    sql, params = build_query(grade, class_name, term, week_no)
    cur = conn.execute(sql, params)
    headers = [d[0] for d in cur.description]
    rows = cur.fetchall()
    if not rows:
        raise HTTPException(404, "没有匹配数据：检查年级/班级/学期/周次，或该周是否已开周")

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerows([tuple(r) for r in rows])

    scope = class_name or (f"{grade}级" if grade else "全体")
    when = f"{term or ''}第{week_no}周" if week_no is not None else "全部周次"
    kind = "二维表" if week_no is not None else "明细"
    filename = f"晚点名_{scope}_{when}_{kind}.csv"

    with conn:
        audit.log(conn, user["id"], "export.csv", filename,
                  {"rows": len(rows), "grade": grade, "class": class_name,
                   "term": term, "weekNo": week_no},
                  client_ip(request))

    quoted = urllib.parse.quote(filename)
    return Response(
        content="﻿" + buf.getvalue(),          # BOM：Excel 直开不乱码
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quoted}"},
    )
