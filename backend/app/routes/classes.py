"""班级列表 + 班级×周交互二维表（管理员）。"""

import sqlite3
from datetime import date as date_cls, timedelta

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..deps import require_admin
from ..services.grids import DAY_KEYS, DAY_LABELS

router = APIRouter(prefix="/classes", tags=["classes"])


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

    start = date_cls.fromisoformat(wk["start_date"])
    offsets = (0, 1, 2, 3, 6)        # 周一~周四 + 周日，周五/周六不点名
    dates = [
        {"key": k, "label": DAY_LABELS[k], "date": (start + timedelta(days=o)).isoformat()}
        for k, o in zip(DAY_KEYS, offsets)
    ]

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
