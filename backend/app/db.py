"""数据库连接：每请求一个连接，强制 FK + busy_timeout。"""

import sqlite3

from .settings import settings


def connect() -> sqlite3.Connection:
    # check_same_thread=False：FastAPI 同步依赖在线程池建连接、async 路由在事件循环用它；
    # 每请求独享连接、用完即关，无并发共享，关闭该检查是安全的
    conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def get_db():
    """FastAPI dependency。"""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
