"""导出考勤数据为 CSV（Excel 可直接打开），支持 年级 / 班级 / 周 三个口径。

用法（口径可组合）：
  # 周 level：某周全体二维表（行=学生，列=周一..周四、周日）
  uv run python scripts/export.py --term 2025-2026-2 --week-no 1

  # 年级 level：某年级某周二维表；不带 --week-no 则导出该年级全部周的长表
  uv run python scripts/export.py --grade 24 --term 2025-2026-2 --week-no 1
  uv run python scripts/export.py --grade 24

  # 班级 level：同理
  uv run python scripts/export.py --class 电信24-2 --term 2025-2026-2 --week-no 1
  uv run python scripts/export.py --class 电信24-2

输出文件默认在 exports/ 下自动命名，--out 可指定路径。
带 --week-no 输出宽表（二维），不带则输出长表（每生每天一行，含状态/原因/返校时间）。
"""

import argparse
import csv
import sys
from pathlib import Path

from _db import PROJECT_ROOT, connect

GRID_COLS = ["term", "week_no", "grade", "major", "class_name",
             "student_id", "student_name", "周一", "周二", "周三", "周四", "周日"]
LONG_COLS = ["term", "week_no", "date", "grade", "major", "class_name",
             "student_id", "student_name", "status", "reason", "return_date"]


def build_query(grade: str | None, class_: str | None, term: str | None,
                week_no: int | None) -> tuple[str, list]:
    where, params = [], []
    if grade:
        where.append("grade = ?")
        params.append(grade)
    if class_:
        where.append("class_name = ?")
        params.append(class_)
    if term:
        where.append("term = ?")
        params.append(term)
    if week_no is not None:
        where.append("week_no = ?")
        params.append(week_no)
    cond = (" WHERE " + " AND ".join(where)) if where else ""
    if week_no is not None:        # 宽表（某周二维）
        sql = (f"SELECT {', '.join(GRID_COLS)} FROM v_week_grid{cond} "
               f"ORDER BY grade, major, class_name, student_id")
    else:                          # 长表（跨周明细）
        sql = (f"SELECT {', '.join(LONG_COLS)} FROM v_att_enriched{cond} "
               f"ORDER BY term, week_no, date, class_name, student_id")
    return sql, params


def auto_name(args) -> str:
    scope = args.class_ or (f"{args.grade}级" if args.grade else "全体")
    when = (f"{args.term}_第{args.week_no}周" if args.week_no is not None
            else (args.term or "全部周次"))
    kind = "二维表" if args.week_no is not None else "明细"
    return f"晚点名_{scope}_{when}_{kind}.csv"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grade", help="年级码，如 24")
    ap.add_argument("--class", dest="class_", help="班级全名，如 电信24-2")
    ap.add_argument("--term", help="学期，如 2025-2026-2")
    ap.add_argument("--week-no", type=int, help="第几周（带=宽表二维，不带=长表明细）")
    ap.add_argument("--out", type=Path, help="输出路径，默认 exports/ 自动命名")
    args = ap.parse_args()

    if args.week_no is not None and not args.term:
        # 库里只有一个学期时自动补全，否则要求显式指定
        conn0 = connect()
        terms = [r[0] for r in conn0.execute("SELECT DISTINCT term FROM week")]
        conn0.close()
        if len(terms) == 1:
            args.term = terms[0]
            print(f"提示: 未指定 --term，自动使用唯一学期 {args.term}", file=sys.stderr)
        else:
            raise SystemExit(f"✗ 带 --week-no 必须指定 --term（库中存在学期: {terms}）")

    sql, params = build_query(args.grade, args.class_, args.term, args.week_no)
    conn = connect()
    try:
        cur = conn.execute(sql, params)
        headers = [d[0] for d in cur.description]
        rows = cur.fetchall()
    finally:
        conn.close()
    if not rows:
        raise SystemExit("✗ 没有匹配数据：检查 年级/班级名/学期/周次 是否正确、该周是否已 seed_week")

    out = args.out or PROJECT_ROOT / "exports" / auto_name(args)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(headers)
        w.writerows(rows)
    print(f"✓ 已导出 {len(rows)} 行 → {out}")


if __name__ == "__main__":
    main()
