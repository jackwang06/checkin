#!/usr/bin/env bash
# 部署/更新脚本（在 huawei2 的仓库目录里跑）：
#   ./deploy.sh            # git pull + 后端依赖/迁移/重启 + 前端构建
#   ./deploy.sh --no-pull  # 跳过 git pull（本地已是目标版本时）
set -euo pipefail
cd "$(dirname "$0")"

if [[ "${1:-}" != "--no-pull" ]]; then
  echo "==> git pull"
  git pull --ff-only
fi

echo "==> uv sync"
uv sync

echo "==> 数据库迁移（init_db 幂等）"
uv run python scripts/init_db.py

echo "==> 重启后端"
sudo systemctl restart checkin-backend.service
sleep 2
curl -sf --noproxy '*' http://127.0.0.1:8002/api/health > /dev/null \
  && echo "    后端健康检查通过" \
  || { echo "    ✗ 后端健康检查失败"; sudo systemctl status checkin-backend.service --no-pager | tail -5; exit 1; }

echo "==> 前端构建"
cd frontend
pnpm install
pnpm build
echo "==> 完成。nginx 服务 frontend/dist，无需重启"
