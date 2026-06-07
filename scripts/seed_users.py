"""从 student 表批量初始化登录账号（离线跑，绝不放 HTTP 请求里）。

用法：uv run python scripts/seed_users.py [--rounds 10]

规则：
  - 每个在读(active)学生一个账号：id=学号，初始密码=学号，must_change_password=1
  - 幂等：ON CONFLICT DO NOTHING，已有账号（含已改密的）不动；新生重跑只补新账号
  - bcrypt rounds 默认 10（初始密码本来就是公开的学号，靠强制改密兜底；
    用户自己改密时后端用默认 rounds=12）
"""

import argparse
import sys
import time

import bcrypt

from _db import connect


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rounds", type=int, default=10, help="bcrypt cost，默认 10")
    args = ap.parse_args()

    conn = connect()
    try:
        todo = [r[0] for r in conn.execute(
            """
            SELECT s.id FROM student s
            LEFT JOIN users u ON u.id = s.id
            WHERE s.status = 'active' AND u.id IS NULL
            """
        )]
        if not todo:
            print("没有需要新建的账号（全部已存在）")
            return

        print(f"待建账号 {len(todo)} 个，bcrypt rounds={args.rounds} ...")
        t0 = time.time()
        rows = []
        for i, sid in enumerate(todo, 1):
            h = bcrypt.hashpw(sid.encode(), bcrypt.gensalt(rounds=args.rounds)).decode()
            rows.append((sid, h, sid))
            if i % 200 == 0:
                print(f"  hash {i}/{len(todo)} ({time.time()-t0:.0f}s)", file=sys.stderr)

        with conn:
            conn.executemany(
                """
                INSERT INTO users (id, password_hash, role, student_id, must_change_password)
                VALUES (?, ?, 'user', ?, 1)
                ON CONFLICT(id) DO NOTHING
                """,
                rows,
            )
        total = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        print(f"完成：新建 {len(rows)} 个，users 表共 {total} 个账号，耗时 {time.time()-t0:.0f}s")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
