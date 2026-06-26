#!/bin/sh
# Render デプロイ用マイグレーションスクリプト
# failed migration がある場合は rolled_back にマークしてから migrate deploy を実行する

set -e

echo "==> Resolving any failed migrations..."
npx prisma migrate resolve --rolled-back 20260626000000_rename_instructor_to_user || echo "  (resolve skipped - migration not in failed state)"

echo "==> Running prisma migrate deploy..."
npx prisma migrate deploy

echo "==> Migration complete."
