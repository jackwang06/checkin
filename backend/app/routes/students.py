"""学生搜索 + 单人报告（管理员）。"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..deps import require_admin
from ..services.grids import abnormal_rows, student_week_rows

router = APIRouter(prefix="/students", tags=["students"])


@router.get("")
def search(q: str = "", limit: int = 20,
           conn: sqlite3.Connection = Depends(get_db),
           user: dict = Depends(require_admin)):
    if not q.strip():
        return []
    like = f"%{q.strip()}%"
    rows = conn.execute(
        """
        SELECT s.id, s.name, s.status, c.full_name AS class_name,
               g.name AS grade, m.name AS major
        FROM student s JOIN class c ON c.id = s.class_id
        JOIN grade g ON g.id = c.grade_id JOIN major m ON m.id = c.major_id
        WHERE s.id LIKE ? OR s.name LIKE ?
        ORDER BY s.id LIMIT ?
        """,
        (like, like, min(limit, 50)),
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "status": r["status"],
             "className": r["class_name"], "grade": r["grade"], "major": r["major"]}
            for r in rows]


@router.get("/{sid}/report")
def report(sid: str, term: str | None = None,
           from_week: int | None = None, to_week: int | None = None,
           conn: sqlite3.Connection = Depends(get_db),
           user: dict = Depends(require_admin)):
    stu = conn.execute(
        """
        SELECT s.id, s.name, s.status, c.full_name AS class_name,
               g.name AS grade, m.name AS major
        FROM student s JOIN class c ON c.id = s.class_id
        JOIN grade g ON g.id = c.grade_id JOIN major m ON m.id = c.major_id
        WHERE s.id = ?
        """,
        (sid,),
    ).fetchone()
    if stu is None:
        raise HTTPException(404, f"学号 {sid} 不存在")
    return {
        "student": {"id": stu["id"], "name": stu["name"], "status": stu["status"],
                    "className": stu["class_name"], "grade": stu["grade"],
                    "major": stu["major"]},
        "grid": student_week_rows(conn, sid, term, from_week, to_week),
        "abnormal": abnormal_rows(conn, sid, term),
    }
