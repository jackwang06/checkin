"""时间轴：建周 + 预填该周全量「无异常」考勤行。

用法：uv run python scripts/seed_week.py --term 2025-2026-2 --week-no 1 --start 2026-06-01
  --start 必须是周一（脚本校验）。
预填范围：周一~周五 + 周日（无周六），所有在读(active)学生，每周 6 天。

幂等（ON CONFLICT DO NOTHING）：
  - 重跑不会把已 UPDATE 成「事假」等状态的行刷回「无异常」
  - 周中新生入班后重跑本脚本，只为新生补行
"""

import argparse
from datetime import date, timedelta

from _db import connect

DAY_OFFSETS = (0, 1, 2, 3, 4, 6)  # 周一~周五 + 周日，跳过周六


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--term", required=True, help="学期，如 2025-2026-2")
    ap.add_argument("--week-no", required=True, type=int, help="学期内第几周")
    ap.add_argument("--start", required=True, help="本周周一日期 YYYY-MM-DD")
    args = ap.parse_args()

    if not 1 <= args.week_no <= 57:
        raise SystemExit(f"错误: --week-no {args.week_no} 超出范围 1-57")
    start = date.fromisoformat(args.start)
    if start.weekday() != 0:
        raise SystemExit(f"错误: --start {args.start} 是周{'一二三四五六日'[start.weekday()]}，必须是周一")
    end = start + timedelta(days=6)

    conn = connect()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO week (term, week_no, start_date, end_date)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(term, week_no) DO UPDATE SET
                    start_date = excluded.start_date,
                    end_date = excluded.end_date
                """,
                (args.term, args.week_no, start.isoformat(), end.isoformat()),
            )
            week_id = conn.execute(
                "SELECT id FROM week WHERE term = ? AND week_no = ?",
                (args.term, args.week_no),
            ).fetchone()[0]

            dates = [(start + timedelta(days=o)).isoformat() for o in DAY_OFFSETS]
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
            inserted = cur.rowcount

        total = conn.execute(
            "SELECT COUNT(*) FROM attendance WHERE week_id = ?", (week_id,)
        ).fetchone()[0]
        n_students = conn.execute(
            "SELECT COUNT(*) FROM student WHERE status = 'active'"
        ).fetchone()[0]
        print(f"{args.term} 第 {args.week_no} 周 ({start} ~ {end})，week_id={week_id}")
        print(f"本次新插入 {inserted} 行，该周累计 {total} 行 "
              f"(在读 {n_students} 人 × {len(DAY_OFFSETS)} 天 = {n_students * len(DAY_OFFSETS)})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
