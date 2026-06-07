"""学籍变动：降级 / 转专业 / 转班级，统一为「改班级归属」。

班级唯一决定 年级+专业，所以三种变动都是同一个操作：
  uv run python scripts/transfer.py <学号> --to <班级全名> [--date YYYY-MM-DD]
  uv run python scripts/transfer.py --list-classes        # 查看所有可选班级

行为：
  - 自动识别并打印变动类型（降级/升级 → 年级变；转专业 → 专业变；否则转班）
  - 自动维护 student_class_history（首次变动时补录原班级的历史区间）
  - 历史考勤行不动（按学号永久归属本人）；统计视图按当前班级归属口径
"""

import argparse
import sys
from datetime import date

from _db import connect


def class_info(conn, where: str, param) -> dict | None:
    row = conn.execute(
        f"""
        SELECT c.id, c.full_name, g.name AS grade, m.name AS major
        FROM class c JOIN grade g ON g.id = c.grade_id JOIN major m ON m.id = c.major_id
        WHERE {where}
        """,
        (param,),
    ).fetchone()
    if row is None:
        return None
    return dict(zip(("id", "full_name", "grade", "major"), row))


def describe_change(old: dict, new: dict) -> str:
    kinds = []
    if old["grade"] != new["grade"]:
        kinds.append("降级" if new["grade"] > old["grade"] else "升级调整")
    if old["major"] != new["major"]:
        kinds.append("转专业")
    if not kinds:
        kinds.append("转班")
    return "+".join(kinds)


def do_transfer(conn, student_id: str, to_class_full_name: str, eff_date: str) -> dict:
    """执行学籍变动。调用方负责事务边界。出错抛 ValueError。"""
    stu = conn.execute(
        "SELECT id, name, class_id, status, enrolled_at FROM student WHERE id = ?",
        (student_id,),
    ).fetchone()
    if stu is None:
        raise ValueError(f"学号 {student_id} 不存在")
    sid, sname, old_class_id, sstatus, enrolled_at = stu

    old = class_info(conn, "c.id = ?", old_class_id)
    new = class_info(conn, "c.full_name = ?", to_class_full_name.strip())
    if new is None:
        raise ValueError(f"班级 {to_class_full_name!r} 不存在")
    if new["id"] == old["id"]:
        raise ValueError(f"该生已在 {new['full_name']}，无需变动")

    has_history = conn.execute(
        "SELECT 1 FROM student_class_history WHERE student_id = ? LIMIT 1", (sid,)
    ).fetchone()
    if not has_history:
        conn.execute(
            "INSERT INTO student_class_history (student_id, class_id, from_date, to_date) "
            "VALUES (?, ?, ?, ?)",
            (sid, old["id"], enrolled_at or "", eff_date),
        )
    else:
        conn.execute(
            "UPDATE student_class_history SET to_date = ? "
            "WHERE student_id = ? AND to_date IS NULL",
            (eff_date, sid),
        )
    conn.execute(
        "INSERT INTO student_class_history (student_id, class_id, from_date, to_date) "
        "VALUES (?, ?, ?, NULL)",
        (sid, new["id"], eff_date),
    )
    conn.execute("UPDATE student SET class_id = ? WHERE id = ?", (new["id"], sid))

    return {"student_id": sid, "name": sname, "student_status": sstatus,
            "kind": describe_change(old, new), "from": old, "to": new,
            "date": eff_date}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("student_id", nargs="?", help="学号")
    ap.add_argument("--to", help="目标班级全名，如 计算机24-2")
    ap.add_argument("--date", default=date.today().isoformat(), help="生效日期，默认今天")
    ap.add_argument("--list-classes", action="store_true", help="列出所有班级")
    args = ap.parse_args()

    conn = connect()
    try:
        if args.list_classes:
            for (name,) in conn.execute(
                "SELECT full_name FROM class c JOIN grade g ON g.id=c.grade_id "
                "ORDER BY g.name, c.full_name"
            ):
                print(name)
            return
        if not (args.student_id and args.to):
            ap.error("需要 <学号> 和 --to <班级全名>（或用 --list-classes 查看班级）")

        try:
            with conn:
                r = do_transfer(conn, args.student_id, args.to, args.date)
        except ValueError as e:
            raise SystemExit(f"✗ {e}（--list-classes 查看全部班级）")

        if r["student_status"] != "active":
            print(f"警告: 该生当前状态为 {r['student_status']}（非在读）", file=sys.stderr)
        print(f"✓ [{r['kind']}] {r['name']}({r['student_id']}): "
              f"{r['from']['full_name']} → {r['to']['full_name']}，生效 {r['date']}")
        if r["from"]["grade"] != r["to"]["grade"]:
            print(f"  年级 {r['from']['grade']} → {r['to']['grade']}；该生历史考勤保留，"
                  f"统计口径自 {r['date']} 起按新班级归属")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
