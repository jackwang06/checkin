"""单点查询：输入学号，输出 周次(1-57) × 星期 的个人考勤二维表。

用法：
  uv run python scripts/student_report.py <学号>                      # 全学期/自开学至今（库内全部周）
  uv run python scripts/student_report.py <学号> --week-no 3          # 仅某一周
  uv run python scripts/student_report.py <学号> --from-week 1 --to-week 8   # 周次区间
  uv run python scripts/student_report.py <学号> --term 2025-2026-2 --out 张三.csv  # 限定学期并导出

终端打印对齐表格；--out 另存 CSV（Excel 可直接打开）。
"""

import argparse
import csv
from pathlib import Path

from _db import PROJECT_ROOT, connect
from sql import format_table

GRID_COLS = ["term", "week_no", "周一", "周二", "周三", "周四", "周日"]


def week_range(v: str) -> int:
    n = int(v)
    if not 1 <= n <= 57:
        raise argparse.ArgumentTypeError(f"周次 {n} 超出范围 1-57")
    return n


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("student_id", help="学号")
    ap.add_argument("--term", help="学期，如 2025-2026-2；默认不限")
    ap.add_argument("--week-no", type=week_range, help="仅查某一周")
    ap.add_argument("--from-week", type=week_range, help="起始周（含）")
    ap.add_argument("--to-week", type=week_range, help="结束周（含）")
    ap.add_argument("--out", type=Path, help="导出 CSV 路径，默认仅打印")
    args = ap.parse_args()

    conn = connect()
    try:
        stu = conn.execute(
            """
            SELECT s.id, s.name, s.status, c.full_name, g.name, m.name
            FROM student s JOIN class c ON c.id = s.class_id
            JOIN grade g ON g.id = c.grade_id JOIN major m ON m.id = c.major_id
            WHERE s.id = ?
            """,
            (args.student_id,),
        ).fetchone()
        if stu is None:
            raise SystemExit(f"✗ 学号 {args.student_id} 不存在")
        sid, sname, sstatus, cls, grade, major = stu
        print(f"{sname}（{sid}） {grade}级 {major} {cls}  学籍状态: {sstatus}")
        print()

        where, params = ["student_id = ?"], [sid]
        if args.term:
            where.append("term = ?")
            params.append(args.term)
        if args.week_no is not None:
            where.append("week_no = ?")
            params.append(args.week_no)
        if args.from_week is not None:
            where.append("week_no >= ?")
            params.append(args.from_week)
        if args.to_week is not None:
            where.append("week_no <= ?")
            params.append(args.to_week)

        cur = conn.execute(
            f"SELECT {', '.join(GRID_COLS)} FROM v_week_grid "
            f"WHERE {' AND '.join(where)} ORDER BY term, week_no",
            params,
        )
        rows = cur.fetchall()
        if not rows:
            raise SystemExit("✗ 该范围内无考勤数据（周次是否已 seed_week？学期/区间是否写对？）")
        print(format_table(cur, rows))

        # 异常汇总 + 明细
        abn = conn.execute(
            f"""
            SELECT date, status, COALESCE(reason, ''), COALESCE(return_date, '')
            FROM v_att_enriched
            WHERE {' AND '.join(where)} AND status <> '无异常'
            ORDER BY date
            """,
            params,
        ).fetchall()
        print()
        if abn:
            counts = {}
            for _, st, _, _ in abn:
                counts[st] = counts.get(st, 0) + 1
            print("异常汇总: " + "  ".join(f"{k}×{v}" for k, v in counts.items()))
            for d, st, reason, ret in abn:
                extra = "".join([f"  原因: {reason}" if reason else "",
                                 f"  返校: {ret}" if ret else ""])
                print(f"  {d}  {st}{extra}")
        else:
            print("异常汇总: 无（全勤）")

        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            with open(args.out, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f)
                w.writerow(["学号", "姓名", "班级"] + GRID_COLS)
                for r in rows:
                    w.writerow([sid, sname, cls, *r])
            print(f"\n✓ 已导出 → {args.out}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
