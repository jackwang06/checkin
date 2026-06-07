"""环境配置。生产环境变量经 systemd EnvironmentFile=backend/.env 注入；
本地开发自动读 backend/.env（如存在）。"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]   # checkin/
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

# 复用数据层 CLI 模块（xlsx_to_csv / import_csv / seed_week / leave_backfill / ...）
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


_load_dotenv(PROJECT_ROOT / "backend" / ".env")


class Settings:
    db_path = Path(os.environ.get("CHECKIN_DB", PROJECT_ROOT / "data" / "checkin.db"))
    uploads_dir = Path(os.environ.get("CHECKIN_UPLOADS", PROJECT_ROOT / "data" / "uploads"))
    jwt_secret = os.environ.get("JWT_SECRET", "dev-secret-DO-NOT-USE-IN-PROD")
    jwt_ttl_minutes = int(os.environ.get("JWT_TTL_MINUTES", "10080"))   # 7 天
    superadmin_id = os.environ.get("SUPERADMIN_ID", "")
    superadmin_password = os.environ.get("SUPERADMIN_PASSWORD", "")
    max_upload_mb = int(os.environ.get("MAX_UPLOAD_MB", "10"))


settings = Settings()
