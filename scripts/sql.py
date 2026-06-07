"""防呆 SQL 入口：日常手写 SQL 请一律走这里，不要直接连库。

用法：
  uv run python scripts/sql.py "SELECT * FROM v_stats_overall"
  uv run python scripts/sql.py "UPDATE attendance SET status='事假' WHERE student_id='xxx' AND date='2026-06-02'"
  uv run python scripts/sql.py            # 不带参数 = 从 stdin 读（支持多条，分号分隔）

护栏：
  1. 强制 PRAGMA foreign_keys=ON —— SQLite 默认关闭！直接连库写错学号/状态会静默成功
  2. 写语句打印受影响行数，0 行时醒目告警（学号写错/日期未预填的最常见症状）
  3. SELECT 结果以对齐表格输出
"""

import sqlite3
import sys

from _db import connect


def format_table(cursor: sqlite3.Cursor, rows: list) -> str:
    if not rows:
        return "(0 行)"
    headers = [d[0] for d in cursor.description]
    cols = [[h] + [("" if v is None else str(v)) for v in col]
            for h, col in zip(headers, zip(*rows))]

    def disp_width(s: str) -> int:  # 中文按 2 宽度对齐
        return sum(2 if ord(ch) > 0x2E7F else 1 for ch in s)

    widths = [max(disp_width(v) for v in col) for col in cols]

    def fmt_row(vals):
        return "  ".join(v + " " * (w - disp_width(v)) for v, w in zip(vals, widths))

    lines = [fmt_row([c[0] for c in cols]),
             fmt_row(["-" * w for w in widths])]
    for i in range(len(rows)):
        lines.append(fmt_row([c[i + 1] for c in cols]))
    lines.append(f"({len(rows)} 行)")
    return "\n".join(lines)


def run_one(conn: sqlite3.Connection, stmt: str) -> None:
    cur = conn.execute(stmt)
    if cur.description:                          # SELECT / RETURNING
        print(format_table(cur, cur.fetchall()))
    else:                                        # INSERT / UPDATE / DELETE / DDL
        n = cur.rowcount
        if n == 0 and stmt.lstrip().upper().startswith(("UPDATE", "DELETE")):
            print("⚠⚠⚠ 受影响 0 行！请检查：学号是否存在、日期是否已预填(seed_week)、条件是否写错")
        else:
            print(f"OK，受影响 {n} 行")


def main() -> None:
    sql_text = " ".join(sys.argv[1:]).strip() if len(sys.argv) > 1 else sys.stdin.read().strip()
    if not sql_text:
        raise SystemExit("用法: uv run python scripts/sql.py \"<SQL>\"  （或从 stdin 输入）")

    conn = connect()
    try:
        with conn:                               # 整体一个事务，出错全部回滚
            # 朴素分号切分足够日常使用；含字面量分号的复杂语句请拆开执行
            for stmt in [s.strip() for s in sql_text.split(";") if s.strip()]:
                run_one(conn, stmt)
    except sqlite3.IntegrityError as e:
        raise SystemExit(f"✗ 约束拦截（已回滚）: {e}\n"
                         f"  提示: 状态只能是 无异常/公假/事假/旷到/失联；学号必须已在名单内")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
