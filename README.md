# Meet補正システム (meet-correction-app)

VTuberスクール向け **Google Meet 録画・文字起こし自動補正システム**

## 概要

Google Calendar予約スケジュール経由で作成されたMeet付き予定を定期スキャンし、
会議の録画・文字起こしを自動でONに補正します。

## 主要機能

- 🔍 Google Calendarの予約イベント自動検知（5分ごと）
- 🔧 Google Meet API経由で録画・文字起こしをONに補正
- 🔄 開始30分前の再確認と自動再補正
- 👥 30名規模のマルチユーザー対応（RBAC）
- 📊 管理者ダッシュボード（全講師の状態監視）
- 👩‍🏫 講師ダッシュボード（個人の連携・補正状態確認）

## 技術スタック

- **Frontend/Backend**: Next.js 15 + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: Auth.js (NextAuth v5)
- **Hosting**: Render
- **Background Jobs**: Render Cron Jobs

## ドキュメント

- **セットアップ手順**: [SETUP.md](./SETUP.md)
- **環境変数テンプレート**: [.env.example](./.env.example)

## 画面構成

| パス | 説明 | ロール |
|------|------|--------|
| `/login` | ログイン | 全員 |
| `/instructor` | 講師マイページ | 講師 |
| `/instructor/events` | 予定一覧 | 講師 |
| `/instructor/corrections` | 補正履歴 | 講師 |
| `/admin` | 管理ダッシュボード | 管理者 |
| `/admin/instructors` | 講師一覧 | 管理者 |
| `/admin/corrections` | 補正履歴一覧 | 管理者 |
| `/admin/audit-logs` | 監査ログ | 管理者 |

## クイックスタート

```bash
# 1. 依存関係インストール
npm install

# 2. 環境変数設定
cp .env.example .env.local
# .env.local を編集

# 3. DBセットアップ
npm run db:migrate:dev
npm run db:seed

# 4. 開発サーバー起動
npm run dev
```

詳細は [SETUP.md](./SETUP.md) を参照してください。
