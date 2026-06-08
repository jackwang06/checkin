"""初始化数据库：执行 schema.sql 并灌入 status_def 种子（有且仅有 5 种状态）。

用法：uv run python scripts/init_db.py
幂等：schema 全部 IF NOT EXISTS，种子 UPSERT，可安全重跑。
"""

from _db import SCHEMA_PATH, connect

# code, label, is_present, is_excused, sort_order
STATUS_SEED = [
    ("无异常", "无异常（正常出勤）", 1, 0, 0),
    ("公假",   "公假",               0, 1, 1),
    ("事假",   "事假",               0, 1, 2),
    ("旷到",   "旷到",               0, 0, 3),
    ("失联",   "失联",               0, 0, 4),
    ("节假日", "节假日（不点名）",   0, 0, 9),  # 系统状态：special_date 宣布假日时打，统计剔除
]


def migrate(conn) -> list[str]:
    """旧库增量迁移：CREATE TABLE IF NOT EXISTS 不会给已存在的表加新列，需显式 ALTER。"""
    done = []
    cols = {r[1] for r in conn.execute("PRAGMA table_info(users)")}
    if cols and "wx_openid" not in cols:
        with conn:
            conn.execute("ALTER TABLE users ADD COLUMN wx_openid TEXT")
        done.append("users.wx_openid")
    return done


def main() -> None:
    conn = connect()
    try:
        migrated = migrate(conn)              # 先迁移旧表，再跑 schema（建新表/索引/视图）
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        with conn:
            conn.executemany(
                """
                INSERT INTO status_def (code, label, is_present, is_excused, sort_order)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    label = excluded.label,
                    is_present = excluded.is_present,
                    is_excused = excluded.is_excused,
                    sort_order = excluded.sort_order
                """,
                STATUS_SEED,
            )
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )]
        n_status = conn.execute("SELECT COUNT(*) FROM status_def").fetchone()[0]
        fk_issues = conn.execute("PRAGMA foreign_key_check").fetchall()
        print(f"建表完成: {', '.join(tables)}")
        if migrated:
            print(f"迁移: {', '.join(migrated)}")
        print(f"status_def 种子: {n_status} 条")
        print(f"foreign_key_check: {'通过' if not fk_issues else fk_issues}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
