#!/usr/bin/env bash
# Deploy to the personal Tencent Cloud server, served at https://www.twincle.com.cn/travel
#
#   deploy/twincle.sh            build current HEAD on the server and (re)start travel-app
#   deploy/twincle.sh --keys     also push AMAP/AI/S3 keys from .env.local into the server env
#
# Layout on the server (/opt/travel-discuss):
#   app.env   root 600 — DATABASE_URL, keys, COOKIE_SECURE (never printed)
#   db.env    root 600 — POSTGRES_* for travel-db
#   pgdata/   Postgres data volume
#   releases/<rev>/  unpacked source used to build the image
# Containers join the Caddy network a-share-net and publish no host ports.
set -euo pipefail

S=root@124.223.185.175
DIR=/opt/travel-discuss
REV=$(git rev-parse --short HEAD)
TAG=travel-discuss:$(date +%Y%m%d)-$REV
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交的改动；部署的是已提交的 HEAD ($REV)" >&2
fi

echo "==> 上传源码 $REV"
ssh $S "mkdir -p $DIR/releases $DIR/pgdata && chmod 700 $DIR"
git archive --format=tar.gz HEAD | ssh $S "rm -rf $DIR/releases/$REV && mkdir -p $DIR/releases/$REV && tar -xzf - -C $DIR/releases/$REV"

echo "==> 服务器端生成数据库密码（已存在则保留）"
ssh $S "cd $DIR && if [ ! -f db.env ]; then
  PW=\$(openssl rand -hex 24)
  printf 'POSTGRES_USER=travel\nPOSTGRES_DB=travel_discuss\nPOSTGRES_PASSWORD=%s\n' \$PW > db.env
  printf 'DATABASE_URL=postgres://travel:%s@travel-db:5432/travel_discuss\nCOOKIE_SECURE=true\n' \$PW > app.env
  chmod 600 db.env app.env
fi"

if [ "${1:-}" = "--keys" ]; then
  echo "==> 同步第三方 Key（不回显）"
  grep -E '^(AMAP_WEB_SERVICE_KEY|AI_BASE_URL|AI_MODEL|AI_API_KEY|S3_[A-Z_]+)=' .env.local |
    ssh $S "cd $DIR && umask 077 && grep -vE '^(AMAP_WEB_SERVICE_KEY|AI_BASE_URL|AI_MODEL|AI_API_KEY|S3_[A-Z_]+)=' app.env > app.env.new; cat >> app.env.new && cat app.env.new > app.env && rm app.env.new"
fi

echo "==> 构建镜像 $TAG（在服务器上）"
ssh $S "docker build -q -t $TAG \
  --build-arg NEXT_PUBLIC_BASE_PATH=/travel \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  $DIR/releases/$REV"

echo "==> 数据库容器"
ssh $S "docker inspect travel-db >/dev/null 2>&1 || docker run -d --name travel-db \
  --network a-share-net --restart unless-stopped --memory 256m \
  --env-file $DIR/db.env -v $DIR/pgdata:/var/lib/postgresql/data postgres:17-alpine"
ssh $S 'for i in $(seq 1 30); do docker exec travel-db pg_isready -q -U travel -d travel_discuss && exit 0; sleep 1; done; exit 1'

echo "==> 应用容器"
ssh $S "docker rm -f travel-app >/dev/null 2>&1 || true; docker run -d --name travel-app \
  --network a-share-net --restart unless-stopped --memory 512m \
  --env-file $DIR/app.env $TAG >/dev/null"
ssh $S 'for i in $(seq 1 30); do docker exec travel-app wget -qO- http://127.0.0.1:3000/travel/api/healthz 2>/dev/null && exit 0; sleep 1; done; docker logs --tail 30 travel-app; exit 1'
echo
echo "==> 完成：$TAG"
echo "    旧镜像：ssh $S 'docker images travel-discuss'"
