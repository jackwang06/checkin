"""多级统计：周 → 年级 → 专业 → 班级（登录可见；口径=按当前班级归属）。"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..deps import get_active_user

router = APIRouter(prefix="/stats", tags=["stats"])

# level -> (视图, 维度列)
LEVELS = {
    "overall": ("v_stats_overall", []),
    "grade":   ("v_stats_grade",   ["grade"]),
    "major":   ("v_stats_major",   ["grade", "major"]),
    "class":   ("v_stats_class",   ["grade", "major", "class_name"]),
}
DIM_OUT = {"grade": "grade", "major": "major", "class_name": "className"}


@router.get("")
def stats(level: str = "overall", term: str | None = None,
          week_no: int | None = None, grade: str | None = None,
          major: str | None = None,
          conn: sqlite3.Connection = Depends(get_db),
          user: dict = Depends(get_active_user)):
    if level not in LEVELS:
        raise HTTPException(422, f"level 只能是 {'/'.join(LEVELS)}")
    view, dims = LEVELS[level]
    where, params = [], []
    if term:
        where.append("term = ?")
        params.append(term)
    if week_no is not None:
        where.append("week_no = ?")
        params.append(week_no)
    if grade and "grade" in dims:
        where.append("grade = ?")
        params.append(grade)
    if major and "major" in dims:
        where.append("major = ?")
        params.append(major)
    cond = (" WHERE " + " AND ".join(where)) if where else ""
    dim_cols = (", ".join(dims) + ", ") if dims else ""
    rows = conn.execute(
        f"""
        SELECT term, week_no, {dim_cols}
               应到人次 AS total, 无异常 AS normal, 公假 AS publicLeave,
               事假 AS personalLeave, 旷到 AS truant, 失联 AS lost, 出勤率 AS rate
        FROM {view}{cond} ORDER BY term, week_no, {dim_cols} 1
        """,
        params,
    ).fetchall()
    out = []
    for r in rows:
        item = {"term": r["term"], "weekNo": r["week_no"],
                "total": r["total"], "normal": r["normal"],
                "publicLeave": r["publicLeave"], "personalLeave": r["personalLeave"],
                "truant": r["truant"], "lost": r["lost"], "rate": r["rate"]}
        for d in dims:
            item[DIM_OUT[d]] = r[d]
        out.append(item)
    return out
