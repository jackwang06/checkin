"""时间轴：建周 + 预填该周全量「无异常」考勤行 + 回填已批假条。

用法：uv run python scripts/seed_week.py --term 2025-2026-2 --week-no 1 --start 2026-06-01
  --start 必须是周一（脚本校验）。
预填范围：周一~周四 + 周日（周五、周六不点名），所有在读(active)学生，每周 5 天。

幂等（ON CONFLICT DO NOTHING）：
  - 重跑不会把已 UPDATE 成「事假」等状态的行刷回「无异常」
  - 周中新生入班后重跑本脚本，只为新生补行
开周后自动扫描已批(approved)假条中落在本周的日期并补写考勤（leave_backfill）。
"""

import argparse
from datetime import date, timedelta

from _db import connect

DAY_OFFSETS = (0, 1, 2, 3, 6)  # 周一~周四 + 周日，周五/周六不点名


def rollcall_dates(start: date) -> list[str]:
    """给定周一日期，返回该周 5 个考勤日（ISO 字符串）。"""
    return [(start + timedelta(days=o)).isoformat() for o in DAY_OFFSETS]


def seed(conn, term: str, week_no: int, start: date) -> dict:
    """建周 + 预填。调用方负责事务边界（建议包在 with conn: 里）。"""
    if not 1 <= week_no <= 57:
        raise ValueError(f"week_no {week_no} 超出范围 1-57")
    if start.weekday() != 0:
        raise ValueError(f"start {start} 是周{'一二三四五六日'[start.weekday()]}，必须是周一")
    end = start + timedelta(days=6)

    conn.execute(
        """
        INSERT INTO week (term, week_no, start_date, end_date)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(term, week_no) DO UPDATE SET
            start_date = excluded.start_date,
            end_date = excluded.end_date
        """,
        (term, week_no, start.isoformat(), end.isoformat()),
    )
    week_id = conn.execute(
        "SELECT id FROM week WHERE term = ? AND week_no = ?", (term, week_no)
    ).fetchone()[0]

    dates = rollcall_dates(start)
    cur = conn.execute(
        f"""
        INSERT INTO attendance (student_id, date, week_id)  -- status 走默认'无异常'
        SELECT s.id, d.column1, ?
        FROM student s
        CROSS JOIN (VALUES {','.join('(?)' for _ in dates)}) AS d
        WHERE s.status = 'active'
        ON CONFLICT(student_id, date) DO NOTHING
        """,
        (week_id, *dates),
    )
    total = conn.execute(
        "SELECT COUNT(*) FROM attendance WHERE week_id = ?", (week_id,)
    ).fetchone()[0]
    n_students = conn.execute(
        "SELECT COUNT(*) FROM student WHERE status = 'active'"
    ).fetchone()[0]
    return {
        "week_id": week_id, "term": term, "week_no": week_no,
        "start": start.isoformat(), "end": end.isoformat(),
        "inserted": cur.rowcount, "total": total, "students": n_students,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--term", required=True, help="学期，如 2025-2026-2")
    ap.add_argument("--week-no", required=True, type=int, help="学期内第几周")
    ap.add_argument("--start", required=True, help="本周周一日期 YYYY-MM-DD")
    args = ap.parse_args()

    conn = connect()
    try:
        with conn:
            try:
                r = seed(conn, args.term, args.week_no, date.fromisoformat(args.start))
            except ValueError as e:
                raise SystemExit(f"错误: {e}")
            # 回填已批假条（延迟导入避免循环依赖）
            from leave_backfill import backfill_approved_leaves
            backfilled = backfill_approved_leaves(conn, r["week_id"])

        print(f"{r['term']} 第 {r['week_no']} 周 ({r['start']} ~ {r['end']})，week_id={r['week_id']}")
        print(f"本次新插入 {r['inserted']} 行，该周累计 {r['total']} 行 "
              f"(在读 {r['students']} 人 × {len(DAY_OFFSETS)} 天 = {r['students'] * len(DAY_OFFSETS)})")
        if backfilled:
            for b in backfilled:
                print(f"  ↳ 回填已批假条 #{b['leave_id']} {b['student_id']} "
                      f"{b['type']} × {len(b['dates'])} 天: {', '.join(b['dates'])}")
        else:
            print("  ↳ 无待回填的已批假条")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
