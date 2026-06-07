"""班级列表 + 班级×周交互二维表（管理员）。"""

import sqlite3
from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..deps import require_admin

router = APIRouter(prefix="/classes", tags=["classes"])

# Python weekday() → (列key, 中文标签)
WD_INFO = {0: ("mon", "周一"), 1: ("tue", "周二"), 2: ("wed", "周三"),
           3: ("thu", "周四"), 4: ("fri", "周五"), 5: ("sat", "周六"),
           6: ("sun", "周日")}


@router.get("")
def list_classes(grade: str | None = None, major: str | None = None,
                 conn: sqlite3.Connection = Depends(get_db),
                 user: dict = Depends(require_admin)):
    where, params = ["1=1"], []
    if grade:
        where.append("g.name = ?")
        params.append(grade)
    if major:
        where.append("m.name = ?")
        params.append(major)
    rows = conn.execute(
        f"""
        SELECT c.id, c.full_name, g.name AS grade, m.name AS major, c.class_no, c.tag,
               (SELECT COUNT(*) FROM student s
                WHERE s.class_id = c.id AND s.status = 'active') AS n
        FROM class c JOIN grade g ON g.id = c.grade_id JOIN major m ON m.id = c.major_id
        WHERE {' AND '.join(where)}
        ORDER BY g.name, m.name, c.class_no
        """,
        params,
    ).fetchall()
    return [{"id": r["id"], "fullName": r["full_name"], "grade": r["grade"],
             "major": r["major"], "classNo": r["class_no"], "tag": r["tag"],
             "studentCount": r["n"]} for r in rows]


@router.get("/{class_id}/grid")
def class_grid(class_id: int, term: str, week_no: int,
               conn: sqlite3.Connection = Depends(get_db),
               user: dict = Depends(require_admin)):
    cls = conn.execute(
        "SELECT id, full_name FROM class WHERE id = ?", (class_id,)
    ).fetchone()
    if cls is None:
        raise HTTPException(404, "班级不存在")
    wk = conn.execute(
        "SELECT id, term, week_no, start_date, end_date FROM week "
        "WHERE term = ? AND week_no = ?",
        (term, week_no),
    ).fetchone()
    if wk is None:
        raise HTTPException(404, f"{term} 第 {week_no} 周还未开周")

    from rollcall import effective_dates   # scripts/ 共享模块（含假日列、补课列）

    start = date_cls.fromisoformat(wk["start_date"])
    dates = []
    for ds in effective_dates(conn, start):
        key, label = WD_INFO[date_cls.fromisoformat(ds).weekday()]
        dates.append({"key": key, "label": label, "date": ds})

    students = conn.execute(
        "SELECT id, name FROM student WHERE class_id = ? AND status = 'active' "
        "ORDER BY id",
        (class_id,),
    ).fetchall()
    att = conn.execute(
        """
        SELECT a.student_id, a.date, a.status, a.reason, a.return_date
        FROM attendance a JOIN student s ON s.id = a.student_id
        WHERE s.class_id = ? AND a.week_id = ?
        """,
        (class_id, wk["id"]),
    ).fetchall()
    by_student: dict[str, dict] = {}
    for r in att:
        by_student.setdefault(r["student_id"], {})[r["date"]] = {
            "status": r["status"], "reason": r["reason"],
            "returnDate": r["return_date"],
        }

    rows = [
        {"studentId": s["id"], "name": s["name"],
         "days": {d["date"]: by_student.get(s["id"], {}).get(d["date"]) for d in dates}}
        for s in students
    ]
    return {
        "classId": cls["id"], "className": cls["full_name"],
        "week": {"id": wk["id"], "term": wk["term"], "weekNo": wk["week_no"],
                 "startDate": wk["start_date"], "endDate": wk["end_date"]},
        "dates": dates,
        "rows": rows,
    }
