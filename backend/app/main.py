"""checkin 后端入口。

本地开发：uv run uvicorn app.main:app --app-dir backend --port 8002 --reload
生产：systemd checkin-backend.service（127.0.0.1:8002，nginx 反代 /api）
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import connect
from .routes import (admins, attendance, audit_log, auth, classes, export,
                     grades, leaves, me, roster, special_dates, stats,
                     students, transfers, users, weeks, wx)
from .services.security import hash_password
from .settings import settings


def bootstrap_superadmin() -> None:
    """确保 .env 配置的超管账号存在（幂等；不覆盖已有密码）。"""
    if not (settings.superadmin_id and settings.superadmin_password):
        return
    conn = connect()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO users (id, password_hash, role, display_name)
                VALUES (?, ?, 'superadmin', '超级管理员')
                ON CONFLICT(id) DO UPDATE SET role = 'superadmin'
                """,
                (settings.superadmin_id, hash_password(settings.superadmin_password)),
            )
    finally:
        conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    bootstrap_superadmin()
    yield


app = FastAPI(title="checkin", lifespan=lifespan)

# 开发期 vite (5173) 跨域；生产同源（nginx 反代），CORS 不生效也无妨
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = FastAPI(title="checkin-api")
for r in (auth, me, weeks, stats, classes, attendance, students, leaves,
          export, transfers, grades, roster, admins, audit_log,
          special_dates, users, wx):
    api.include_router(r.router)


@api.get("/health")
def health():
    return {"ok": True}


app.mount("/api", api)
