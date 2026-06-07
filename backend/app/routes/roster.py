"""名单导入（管理员）：上传 xlsx → 胶水层规范化 → 维度表 UPSERT。

完全复用 scripts/xlsx_to_csv.convert() + import_csv.import_roster()。
注意 import_roster 不覆盖已有学生的班级归属（库内为准），漂移走 transfer。
新生导入后记得开周（或重跑本周开周）补考勤行 + seed_users 补账号。
"""

import csv
import io
import sqlite3
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile

from ..db import get_db
from ..deps import client_ip, require_admin
from ..services import audit
from ..settings import settings

router = APIRouter(prefix="/roster", tags=["roster"])


@router.post("/import")
async def import_roster_xlsx(file: UploadFile, request: Request,
                             conn: sqlite3.Connection = Depends(get_db),
                             user: dict = Depends(require_admin)):
    from import_csv import import_roster   # scripts/ 共享模块
    from xlsx_to_csv import convert

    if not (file.filename or "").endswith(".xlsx"):
        raise HTTPException(422, "请上传 .xlsx 名单文件")
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(422, f"文件不能超过 {settings.max_upload_mb}MB")

    before = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("grade", "major", "class", "student")}

    with tempfile.TemporaryDirectory() as tmp:
        xlsx = Path(tmp) / "roster.xlsx"
        xlsx.write_bytes(data)
        out_csv = Path(tmp) / "roster.csv"
        buf = io.StringIO()
        try:
            with redirect_stdout(buf):       # convert/import 的 print 收进日志
                convert(xlsx, out_csv)
                import_roster(out_csv)
        except Exception as e:
            raise HTTPException(422, f"解析/导入失败: {e}")

        conflicts = []
        cpath = Path(tmp) / "roster_conflicts.csv"
        if cpath.exists():
            with open(cpath, encoding="utf-8-sig") as f:
                conflicts = list(csv.DictReader(f))

    after = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
             for t in ("grade", "major", "class", "student")}
    delta = {t: after[t] - before[t] for t in after}

    with conn:
        audit.log(conn, user["id"], "roster.import", file.filename,
                  {"added": delta, "conflicts": len(conflicts)},
                  client_ip(request))

    return {"added": {"grades": delta["grade"], "majors": delta["major"],
                      "classes": delta["class"], "students": delta["student"]},
            "totals": {"grades": after["grade"], "majors": after["major"],
                       "classes": after["class"], "students": after["student"]},
            "conflicts": conflicts,
            "log": buf.getvalue().strip().splitlines(),
            "nextSteps": "新生导入后：重跑本周开周补考勤行；在服务器跑 seed_users.py 补登录账号"}
