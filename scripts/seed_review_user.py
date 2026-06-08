"""创建/删除「微信审核专用」测试账号（用一个不存在的学号，不碰真实学生）。

创建：uv run python scripts/seed_review_user.py \
        --id 20009999001 --name 审核测试 --class '电信23-1（实验班）' --password checkin2026
  - 在指定班级建一个合成 student（active）
  - 建对应 user（role=user, 绑本人, 固定密码, must_change_password=0 免改密）
  - 为该生回填所有已开周的考勤行（无异常），让审核员进「我的考勤」看到完整数据
  - 审计 review.seed

删除（审核通过后）：uv run python scripts/seed_review_user.py --id 20009999001 --remove
  - 删该生考勤 + user + student（恢复干净，统计/名单不留痕）
"""

import argparse

import bcrypt

from _db import connect


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--id", required=True, help="测试学号（须不存在）")
    ap.add_argument("--name", default="审核测试")
    ap.add_argument("--class", dest="klass", help="班级全名，如 电信23-1（实验班）")
    ap.add_argument("--password", default="checkin2026")
    ap.add_argument("--remove", action="store_true", help="删除该测试账号及其数据")
    args = ap.parse_args()

    conn = connect()
    try:
        if args.remove:
            with conn:
                a = conn.execute("DELETE FROM attendance WHERE student_id=?", (args.id,)).rowcount
                conn.execute("DELETE FROM leave_request WHERE student_id=?", (args.id,))
                conn.execute("DELETE FROM audit_log WHERE user_id=?", (args.id,))  # 解外键
                u = conn.execute("DELETE FROM users WHERE id=?", (args.id,)).rowcount
                conn.execute("DELETE FROM student_class_history WHERE student_id=?", (args.id,))
                s = conn.execute("DELETE FROM student WHERE id=?", (args.id,)).rowcount
            print(f"已删除测试账号 {args.id}: student {s}, user {u}, 考勤 {a} 行")
            return

        if conn.execute("SELECT 1 FROM student WHERE id=?", (args.id,)).fetchone():
            raise SystemExit(f"✗ 学号 {args.id} 已存在，换一个不存在的学号")
        if not args.klass:
            raise SystemExit("✗ 创建需要 --class 班级全名")
        cls = conn.execute("SELECT id FROM class WHERE full_name=?", (args.klass,)).fetchone()
        if cls is None:
            raise SystemExit(f"✗ 班级 {args.klass!r} 不存在")

        pw_hash = bcrypt.hashpw(args.password.encode(), bcrypt.gensalt(12)).decode()
        with conn:
            conn.execute(
                "INSERT INTO student (id, name, class_id, status, enrolled_at) "
                "VALUES (?, ?, ?, 'active', date('now','localtime'))",
                (args.id, args.name, cls[0]),
            )
            conn.execute(
                "INSERT INTO users (id, password_hash, role, student_id, must_change_password) "
                "VALUES (?, ?, 'user', ?, 0)",
                (args.id, pw_hash, args.id),
            )
            # 回填所有已开周的考勤日（无异常）
            ins = conn.execute(
                """
                INSERT OR IGNORE INTO attendance (student_id, date, week_id, status)
                SELECT ?, d.date, d.week_id, '无异常'
                FROM (SELECT DISTINCT date, week_id FROM attendance) AS d
                """,
                (args.id,),
            ).rowcount
            conn.execute(
                "INSERT INTO audit_log (user_id, action, target, detail) VALUES "
                "(?, 'review.seed', ?, ?)",
                (args.id, args.id, f'{{"name":"{args.name}","class":"{args.klass}"}}'),
            )
        print(f"✓ 已建测试账号 {args.id}（{args.name} @ {args.klass}），"
              f"回填考勤 {ins} 行，密码={args.password}，免强制改密")
        print("  审核备注填：学号 " + args.id + " / 密码 " + args.password)
        print("  审核通过后清理：uv run python scripts/seed_review_user.py --id "
              + args.id + " --remove")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
