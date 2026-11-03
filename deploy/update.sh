#!/usr/bin/env bash
# Pull the latest main and restart the backend, in one word.
#
# Install on the server:
#   sudo install -m 755 deploy/update.sh /usr/local/bin/kilometer-update
# Then every future update is:
#   kilometer-update
#
# It stops rather than guesses: uncommitted edits on the server, a failed build or a
# backend that does not answer afterwards all leave a message instead of a half-done
# deploy. The database lives in a named volume and is never touched here.
set -euo pipefail

REPO="${KILOMETER_REPO:-$HOME/koreamate}"
COMPOSE="deploy/compose.yaml"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ -d "$REPO/.git" ] || die "找不到代码目录：$REPO"
cd "$REPO"

if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short
  die "服务器上有未提交的改动，先处理上面这些文件再更新。"
fi

say "① 拉取最新代码"
git fetch origin main
before="$(git rev-parse HEAD)"
git checkout -B main origin/main
after="$(git rev-parse HEAD)"

if [ "$before" = "$after" ]; then
  say "代码已经是最新的（$(git log --oneline -1)），仍会重建以确保运行的是这一版。"
else
  say "本次更新的内容："
  git log --oneline "$before..$after" | sed 's/^/  /'
fi

say "② 重建并启动（1~3 分钟，刷屏是正常的）"
docker compose -f "$COMPOSE" up -d --build

say "③ 等待后端应答"
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    printf '\n\033[32m✅ 更新完成：%s\033[0m\n' "$(git log --oneline -1)"
    printf '   后端健康检查通过，数据库未受影响。\n\n'
    exit 0
  fi
  sleep 2
done

docker compose -f "$COMPOSE" logs --tail 40 platform || true
die "后端 60 秒内没有应答，上面是最后 40 行日志。网站可能仍在运行旧版本。"
