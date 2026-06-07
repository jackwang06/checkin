#!/usr/bin/env bash
# 一次性 root 安装（在 huawei2 上）：sudo bash ops/install_root.sh <cloudflared-token>
# 安装 checkin-backend.service + nginx checkin-tunnel + cloudflared-checkin.service。
# 不触碰现有的 aurash 服务（cloudflared.service / aurash-backend.service / aurash* nginx）。
set -euo pipefail
cd "$(dirname "$0")"

TOKEN="${1:?用法: sudo bash ops/install_root.sh <cloudflared-token>}"

echo "==> systemd: checkin-backend.service"
cp checkin-backend.service /etc/systemd/system/checkin-backend.service

echo "==> systemd: cloudflared-checkin.service（token 注入，不落 git）"
sed "s|__CF_TOKEN__|${TOKEN}|" cloudflared-checkin.service \
  > /etc/systemd/system/cloudflared-checkin.service
chmod 600 /etc/systemd/system/cloudflared-checkin.service

echo "==> nginx: checkin-tunnel"
cp checkin-tunnel /etc/nginx/sites-available/checkin-tunnel
ln -sf /etc/nginx/sites-available/checkin-tunnel /etc/nginx/sites-enabled/checkin-tunnel
nginx -t

echo "==> 启动"
systemctl daemon-reload
systemctl enable --now checkin-backend.service
systemctl enable --now cloudflared-checkin.service
systemctl reload nginx

sleep 2
echo "==> 状态"
systemctl is-active checkin-backend.service cloudflared-checkin.service nginx \
  cloudflared.service aurash-backend.service
echo "==> 完成。验证: curl -s --noproxy '*' http://127.0.0.1:8481/api/health"
