"""共享数据库连接：所有脚本必须经此连接，保证 PRAGMA foreign_keys=ON。

SQLite 的 foreign_keys 是连接级开关且默认关闭——不开的话，
写错学号/状态值会静默成功，这是本系统最大的数据质量风险。
"""

import os
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
# CHECKIN_DB 环境变量可覆盖库路径（测试用副本库、服务器自定义路径）
DB_PATH = Path(os.environ.get("CHECKIN_DB", PROJECT_ROOT / "data" / "checkin.db"))
SCHEMA_PATH = PROJECT_ROOT / "schema.sql"


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn
