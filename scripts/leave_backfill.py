"""已批假条 → 考勤写入（共享模块：CLI seed_week 和 Web 后端共用，单一真相源）。

核心语义（与计划文档一致）：
  - 枚举假条区间内的考勤日（周一~四+周日，跳周五/周六）
  - 只写「已开周」的日期（week 表能定位到的）；未开周日期留给将来开周时回填
  - 覆盖规则：审批是显式管理动作，直接覆盖原状态；原状态非「无异常」时记入 overwritten 报告
  - applied_dates 记录每张假条实际写入过的日期（JSON 数组），幂等去重 + 撤销依据
"""

import json
from datetime import date, timedelta


def leave_dates(start_date: str, end_date: str) -> list[str]:
    """假条区间内的考勤日（跳周五、周六）。"""
    d0, d1 = date.fromisoformat(start_date), date.fromisoformat(end_date)
    out, d = [], d0
    while d <= d1:
        if d.weekday() not in (4, 5):  # 4=周五 5=周六 不点名
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def apply_leave(conn, leave_row: dict, only_dates: list[str] | None = None) -> dict:
    """把一张 approved 假条写入考勤。调用方负责事务。

    leave_row 需含: id, student_id, type, start_date, end_date, reason,
                    return_date, applied_dates
    only_dates: 限定只处理这些日期（开周回填时传本周日期），None = 全区间
    返回 {applied: [...], skipped_no_week: [...], overwritten: [{date, from}]}
    """
    already = set(json.loads(leave_row["applied_dates"] or "[]"))
    candidates = [d for d in leave_dates(leave_row["start_date"], leave_row["end_date"])
                  if d not in already and (only_dates is None or d in only_dates)]

    applied, skipped, overwritten = [], [], []
    for d in candidates:
        wk = conn.execute(
            "SELECT id FROM week WHERE ? BETWEEN start_date AND end_date", (d,)
        ).fetchone()
        if wk is None:
            skipped.append(d)
            continue
        old = conn.execute(
            "SELECT status FROM attendance WHERE student_id = ? AND date = ?",
            (leave_row["student_id"], d),
        ).fetchone()
        if old and old[0] not in ("无异常", leave_row["type"]):
            overwritten.append({"date": d, "from": old[0]})
        conn.execute(
            """
            INSERT INTO attendance (student_id, date, week_id, status, reason, return_date,
                                    updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
            ON CONFLICT(student_id, date) DO UPDATE SET
                status = excluded.status,
                reason = excluded.reason,
                return_date = excluded.return_date,
                updated_at = excluded.updated_at
            """,
            (leave_row["student_id"], d, wk[0], leave_row["type"],
             f"假条#{leave_row['id']}: {leave_row['reason']}", leave_row["return_date"]),
        )
        applied.append(d)

    if applied:
        conn.execute(
            "UPDATE leave_request SET applied_dates = ? WHERE id = ?",
            (json.dumps(sorted(already | set(applied)), ensure_ascii=False),
             leave_row["id"]),
        )
    return {"applied": applied, "skipped_no_week": skipped, "overwritten": overwritten}


def revert_leave(conn, leave_row: dict) -> list[str]:
    """改判/撤销已批假条：把 applied_dates 里的格子还原为「无异常」（不删行）。"""
    dates = json.loads(leave_row["applied_dates"] or "[]")
    for d in dates:
        conn.execute(
            """
            UPDATE attendance SET status = '无异常', reason = NULL, return_date = NULL,
                                  updated_at = datetime('now','localtime')
            WHERE student_id = ? AND date = ? AND status = ?
            """,
            (leave_row["student_id"], d, leave_row["type"]),
        )
    conn.execute("UPDATE leave_request SET applied_dates = NULL WHERE id = ?",
                 (leave_row["id"],))
    return dates


def backfill_approved_leaves(conn, week_id: int) -> list[dict]:
    """开周后调用：把与本周相交、尚有未写日期的 approved 假条补写进本周。"""
    wk = conn.execute(
        "SELECT start_date, end_date FROM week WHERE id = ?", (week_id,)
    ).fetchone()
    if wk is None:
        return []
    week_days = leave_dates(wk[0], wk[1])

    rows = conn.execute(
        """
        SELECT id, student_id, type, start_date, end_date, reason, return_date,
               applied_dates
        FROM leave_request
        WHERE status = 'approved' AND start_date <= ? AND end_date >= ?
        """,
        (wk[1], wk[0]),
    ).fetchall()

    results = []
    for r in rows:
        leave = dict(zip(("id", "student_id", "type", "start_date", "end_date",
                          "reason", "return_date", "applied_dates"), r))
        res = apply_leave(conn, leave, only_dates=week_days)
        if res["applied"]:
            results.append({"leave_id": leave["id"], "student_id": leave["student_id"],
                            "type": leave["type"], "dates": res["applied"]})
    return results
