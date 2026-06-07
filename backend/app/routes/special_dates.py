"""特殊日期：法定假日（停点）/ 调休补课日（加点）管理（管理员）。

宣布/撤销时即时修复已有考勤行：
  - holiday：该日已有行 → 全部改为「节假日」（原异常值写入审计）；未开周则开周时预填节假日
  - makeup：该日已开周 → 为全体在读学生补插「无异常」行；未开周则开周时自动含
  - 撤销 holiday：节假日行还原「无异常」（被覆盖的历史异常不自动恢复，宣布时已留痕）
  - 撤销 makeup：该日若有异常标记 → 409 拒绝（提示先清理）；干净则删行
"""

import sqlite3
from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException, Request

from ..db import get_db
from ..deps import client_ip, get_active_user, require_admin
from ..services import audit

router = APIRouter(prefix="/special-dates", tags=["special-dates"])

WD = "一二三四五六日"


@router.get("")
def list_special(from_date: str | None = None, to_date: str | None = None,
                 conn: sqlite3.Connection = Depends(get_db),
                 user: dict = Depends(get_active_user)):
    where, params = [], []
    if from_date:
        where.append("date >= ?")
        params.append(from_date)
    if to_date:
        where.append("date <= ?")
        params.append(to_date)
    cond = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT date, kind, note, created_at FROM special_date{cond} ORDER BY date",
        params,
    ).fetchall()
    return [{"date": r["date"], "kind": r["kind"], "note": r["note"],
             "createdAt": r["created_at"]} for r in rows]


@router.post("", status_code=201)
def add_special(body: dict, request: Request,
                conn: sqlite3.Connection = Depends(get_db),
                user: dict = Depends(require_admin)):
    d = (body.get("date") or "").strip()
    kind = (body.get("kind") or "").strip()
    note = (body.get("note") or "").strip() or None
    try:
        wd = date_cls.fromisoformat(d).weekday()
    except ValueError:
        raise HTTPException(422, f"日期格式错误: {d}")
    if kind not in ("holiday", "makeup"):
        raise HTTPException(422, "kind 只能是 holiday 或 makeup")
    # 星期合法性：假日只能落基础点名日（一~四/日）；补课只能落周五/六
    if kind == "holiday" and wd in (4, 5):
        raise HTTPException(422, f"{d} 是周{WD[wd]}，本就不点名，无需设为假日")
    if kind == "makeup" and wd not in (4, 5):
        raise HTTPException(422, f"{d} 是周{WD[wd]}，本就点名，无需设为补课日")
    if conn.execute("SELECT 1 FROM special_date WHERE date = ?", (d,)).fetchone():
        raise HTTPException(409, f"{d} 已是特殊日期，请先删除再重设")

    report: dict = {}
    with conn:
        conn.execute(
            "INSERT INTO special_date (date, kind, note) VALUES (?, ?, ?)",
            (d, kind, note),
        )
        wk = conn.execute(
            "SELECT id FROM week WHERE ? BETWEEN start_date AND end_date", (d,)
        ).fetchone()
        if kind == "holiday" and wk:
            # 记录被覆盖的异常行，再全改节假日
            overwritten = conn.execute(
                """
                SELECT a.student_id, s.name, a.status FROM attendance a
                JOIN student s ON s.id = a.student_id
                WHERE a.date = ? AND a.status NOT IN ('无异常', '节假日')
                """,
                (d,),
            ).fetchall()
            cur = conn.execute(
                "UPDATE attendance SET status='节假日', reason=NULL, return_date=NULL, "
                "updated_at=datetime('now','localtime') WHERE date = ?",
                (d,),
            )
            report = {"markedHoliday": cur.rowcount,
                      "overwritten": [{"studentId": o["student_id"], "name": o["name"],
                                       "from": o["status"]} for o in overwritten]}
        elif kind == "makeup" and wk:
            cur = conn.execute(
                """
                INSERT INTO attendance (student_id, date, week_id, status)
                SELECT s.id, ?, ?, '无异常' FROM student s WHERE s.status='active'
                ON CONFLICT(student_id, date) DO NOTHING
                """,
                (d, wk["id"]),
            )
            report = {"insertedRows": cur.rowcount}
        else:
            report = {"note": "该日所在周尚未开周，开周时自动处理"}

        audit.log(conn, user["id"], "special_date.add", d,
                  {"kind": kind, "note": note, **report}, client_ip(request))
    return {"date": d, "kind": kind, "note": note, **report}


@router.delete("/{d}")
def remove_special(d: str, request: Request,
                   conn: sqlite3.Connection = Depends(get_db),
                   user: dict = Depends(require_admin)):
    row = conn.execute("SELECT kind, note FROM special_date WHERE date = ?", (d,)).fetchone()
    if row is None:
        raise HTTPException(404, "该日期不是特殊日期")
    kind = row["kind"]

    report: dict = {}
    with conn:
        if kind == "holiday":
            cur = conn.execute(
                "UPDATE attendance SET status='无异常', "
                "updated_at=datetime('now','localtime') "
                "WHERE date = ? AND status='节假日'",
                (d,),
            )
            report = {"restoredRows": cur.rowcount}
        else:  # makeup
            abnormal = conn.execute(
                "SELECT COUNT(*) FROM attendance WHERE date = ? AND status <> '无异常'",
                (d,),
            ).fetchone()[0]
            if abnormal > 0:
                raise HTTPException(
                    409,
                    f"{d} 已有 {abnormal} 条异常考勤标记，撤销补课会删除当日全部记录；"
                    f"请先在班级周表清理这些标记后再撤销")
            cur = conn.execute("DELETE FROM attendance WHERE date = ?", (d,))
            report = {"deletedRows": cur.rowcount}
        conn.execute("DELETE FROM special_date WHERE date = ?", (d,))
        audit.log(conn, user["id"], "special_date.remove", d,
                  {"kind": kind, **report}, client_ip(request))
    return {"date": d, "kind": kind, **report}
