"""年级生命周期管理：毕业归档 / 彻底删除 / 新年级导入。

用法：
  uv run python scripts/grade_ops.py graduate --grade 23
      毕业归档（推荐）：年级标记 archived、学生标记 graduated。
      历史考勤全部保留可查；seed_week 不再为其预填、统计视图自动排除。

  uv run python scripts/grade_ops.py remove --grade 23 [--yes]
      彻底删除：该年级的考勤/学籍历史/学生/班级/年级行全部物理删除！
      不带 --yes 为试运行（只显示将删除的数量）。删除不可恢复，建议先备份 data/checkin.db。

  uv run python scripts/grade_ops.py enroll --xlsx 2026新生名单.xlsx
      新年级导入：xlsx → csv/<文件名>.csv → 维度表，一条龙（幂等）。
      之后跑 seed_week.py 即开始为新年级预填考勤。
"""

import argparse
from datetime import date
from pathlib import Path

from _db import PROJECT_ROOT, connect
from import_csv import import_roster
from xlsx_to_csv import convert


def grade_counts(conn, grade_name: str) -> dict:
    row = conn.execute(
        """
        SELECT g.id, g.status,
               (SELECT COUNT(*) FROM class c WHERE c.grade_id = g.id),
               (SELECT COUNT(*) FROM student s JOIN class c ON c.id = s.class_id
                WHERE c.grade_id = g.id),
               (SELECT COUNT(*) FROM attendance a JOIN student s ON s.id = a.student_id
                JOIN class c ON c.id = s.class_id WHERE c.grade_id = g.id)
        FROM grade g WHERE g.name = ?
        """,
        (grade_name,),
    ).fetchone()
    if row is None:
        raise SystemExit(f"✗ 年级 {grade_name!r} 不存在")
    return dict(zip(("id", "status", "classes", "students", "attendance"), row))


def cmd_graduate(args) -> None:
    conn = connect()
    try:
        info = grade_counts(conn, args.grade)
        if info["status"] == "archived":
            print(f"年级 {args.grade} 已是归档状态，无需重复操作")
            return
        today = date.today().isoformat()
        with conn:
            conn.execute(
                "UPDATE grade SET status='archived', archived_at=? WHERE id=?",
                (today, info["id"]),
            )
            cur = conn.execute(
                """
                UPDATE student SET status='graduated', left_at=?
                WHERE status='active'
                  AND class_id IN (SELECT id FROM class WHERE grade_id=?)
                """,
                (today, info["id"]),
            )
        print(f"✓ 年级 {args.grade} 已毕业归档：{cur.rowcount} 名在读学生标记为 graduated，"
              f"{info['attendance']} 行历史考勤保留")
        print("  此后 seed_week 不再为该年级预填，统计视图自动排除；"
              "如需恢复：UPDATE grade SET status='active' ... + UPDATE student SET status='active' ...")
    finally:
        conn.close()


def cmd_remove(args) -> None:
    conn = connect()
    try:
        info = grade_counts(conn, args.grade)
        print(f"年级 {args.grade}（{info['status']}）将删除：班级 {info['classes']} 个、"
              f"学生 {info['students']} 人、考勤 {info['attendance']} 行、及其学籍历史")
        if not args.yes:
            print("（试运行，未删除。确认请加 --yes；删除不可恢复，建议先备份 data/checkin.db）")
            return
        with conn:
            conn.execute(
                "DELETE FROM attendance WHERE student_id IN "
                "(SELECT s.id FROM student s JOIN class c ON c.id=s.class_id WHERE c.grade_id=?)",
                (info["id"],),
            )
            conn.execute(
                "DELETE FROM student_class_history WHERE class_id IN "
                "(SELECT id FROM class WHERE grade_id=?) OR student_id IN "
                "(SELECT s.id FROM student s JOIN class c ON c.id=s.class_id WHERE c.grade_id=?)",
                (info["id"], info["id"]),
            )
            conn.execute(
                "DELETE FROM student WHERE class_id IN (SELECT id FROM class WHERE grade_id=?)",
                (info["id"],),
            )
            conn.execute("DELETE FROM class WHERE grade_id=?", (info["id"],))
            conn.execute("DELETE FROM grade WHERE id=?", (info["id"],))
        print(f"✓ 年级 {args.grade} 已彻底删除")
    finally:
        conn.close()


def cmd_enroll(args) -> None:
    xlsx = Path(args.xlsx)
    if not xlsx.exists():
        raise SystemExit(f"✗ 文件不存在: {xlsx}")
    out_csv = PROJECT_ROOT / "csv" / f"{xlsx.stem}.csv"
    convert(xlsx, out_csv)
    import_roster(out_csv)
    print("✓ 新名单导入完成；下一步跑 seed_week.py 即开始为新生预填考勤")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("graduate", help="毕业归档（保留历史）")
    p.add_argument("--grade", required=True, help="年级码，如 23")
    p.set_defaults(func=cmd_graduate)

    p = sub.add_parser("remove", help="彻底删除（不可恢复！默认试运行）")
    p.add_argument("--grade", required=True, help="年级码，如 23")
    p.add_argument("--yes", action="store_true", help="确认执行删除")
    p.set_defaults(func=cmd_remove)

    p = sub.add_parser("enroll", help="新年级名单导入（xlsx 一条龙）")
    p.add_argument("--xlsx", required=True, help="新名单 xlsx 路径")
    p.set_defaults(func=cmd_enroll)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
