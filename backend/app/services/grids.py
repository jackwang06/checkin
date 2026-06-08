"""二维表/报告查询（v_week_grid / v_att_enriched 的统一序列化）。"""

import sqlite3

DAY_KEYS = ["mon", "tue", "wed", "thu", "sun"]
DAY_LABELS = {"mon": "周一", "tue": "周二", "wed": "周三",
              "thu": "周四", "sun": "周日"}
_GRID_SQL_COLS = '"周一","周二","周三","周四","周日"'


def student_week_rows(conn: sqlite3.Connection, student_id: str,
                      term: str | None = None,
                      from_week: int | None = None,
                      to_week: int | None = None,
                      week_no: int | None = None) -> list[dict]:
    """某学生的 周次×星期 行（我的考勤 / 单人报告共用）。"""
    where, params = ["student_id = ?"], [student_id]
    if term:
        where.append("term = ?")
        params.append(term)
    if week_no is not None:
        where.append("week_no = ?")
        params.append(week_no)
    if from_week is not None:
        where.append("week_no >= ?")
        params.append(from_week)
    if to_week is not None:
        where.append("week_no <= ?")
        params.append(to_week)
    rows = conn.execute(
        f"SELECT term, week_no, {_GRID_SQL_COLS} FROM v_week_grid "
        f"WHERE {' AND '.join(where)} ORDER BY term, week_no",
        params,
    ).fetchall()
    return [
        {"term": r[0], "weekNo": r[1], **dict(zip(DAY_KEYS, r[2:]))}
        for r in rows
    ]


def abnormal_rows(conn: sqlite3.Connection, student_id: str,
                  term: str | None = None) -> list[dict]:
    # 异常明细：排除「无异常」与系统状态「节假日」
    where, params = ["student_id = ?", "status NOT IN ('无异常', '节假日')"], [student_id]
    if term:
        where.append("term = ?")
        params.append(term)
    rows = conn.execute(
        f"""
        SELECT date, status, reason, return_date, term, week_no
        FROM v_att_enriched WHERE {' AND '.join(where)} ORDER BY date
        """,
        params,
    ).fetchall()
    return [
        {"date": r["date"], "status": r["status"], "reason": r["reason"],
         "returnDate": r["return_date"], "term": r["term"], "weekNo": r["week_no"]}
        for r in rows
    ]
