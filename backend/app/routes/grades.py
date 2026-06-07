"""年级生命周期：毕业归档（管理员）/ 彻底删除（超管，需 confirm）。"""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request

from ..db import get_db
from ..deps import client_ip, require_admin, require_superadmin
from ..services import audit

router = APIRouter(prefix="/grades", tags=["grades"])


@router.get("")
def list_grades(conn: sqlite3.Connection = Depends(get_db),
                user: dict = Depends(require_admin)):
    rows = conn.execute(
        """
        SELECT g.id, g.name, g.enroll_year, g.status, g.archived_at,
               (SELECT COUNT(*) FROM class c WHERE c.grade_id = g.id) AS classes,
               (SELECT COUNT(*) FROM student s JOIN class c ON c.id = s.class_id
                WHERE c.grade_id = g.id AND s.status = 'active') AS active_students
        FROM grade g ORDER BY g.name
        """
    ).fetchall()
    return [{"id": r["id"], "name": r["name"], "enrollYear": r["enroll_year"],
             "status": r["status"], "archivedAt": r["archived_at"],
             "classes": r["classes"], "activeStudents": r["active_students"]}
            for r in rows]


@router.post("/{name}/graduate")
def graduate(name: str, request: Request,
             conn: sqlite3.Connection = Depends(get_db),
             user: dict = Depends(require_admin)):
    from grade_ops import graduate_grade   # scripts/ 共享模块

    try:
        with conn:
            r = graduate_grade(conn, name)
            if not r["already"]:
                audit.log(conn, user["id"], "grade.graduate", name,
                          {"graduated": r["graduated"],
                           "attendanceKept": r["attendance"]},
                          client_ip(request))
    except SystemExit as e:          # grade_counts 对不存在年级 raise SystemExit
        raise HTTPException(404, str(e))
    return {"name": name, "already": r["already"],
            "graduated": r.get("graduated", 0),
            "attendanceKept": r["attendance"]}


@router.delete("/{name}")
def remove(name: str, request: Request, confirm: bool = False,
           conn: sqlite3.Connection = Depends(get_db),
           user: dict = Depends(require_superadmin)):
    from grade_ops import grade_counts, remove_grade   # scripts/ 共享模块

    try:
        info = grade_counts(conn, name)
    except SystemExit as e:
        raise HTTPException(404, str(e))
    if not confirm:
        return {"dryRun": True, **{
            "classes": info["classes"], "students": info["students"],
            "attendance": info["attendance"], "status": info["status"]}}
    with conn:
        remove_grade(conn, name)
        audit.log(conn, user["id"], "grade.remove", name,
                  {"classes": info["classes"], "students": info["students"],
                   "attendance": info["attendance"]},
                  client_ip(request))
    return {"dryRun": False, "deleted": True, "classes": info["classes"],
            "students": info["students"], "attendance": info["attendance"]}
