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

## SEC-017：既存セッションの権限更新

保護された画面・APIがAuth.jsでセッションを読むたびに、利用者の存在・`isActive`・現在の`role`・`mustChangePassword`をDBから取得します。削除・無効化された利用者は、期限内の既存JWTを持っていても認証されません。降格済み利用者へ旧JWTの管理者権限を引き継がず、クライアントのセッション更新データから権限を採用しません。DBエラー時も旧権限へフォールバックしません。

既存のログイン方式・24時間のJWT期限・DBschema・環境変数は変更していません。新しい設定は不要です。DB再照会が各セッション読取りで発生するため、DB障害時は保護画面/APIが利用できなくなります。Edge middleware内のJWT参照は画面遷移の補助であり、最終的な認証・認可は既存のサーバー側Auth.jsと各APIで行います。

`npm run test:security`で、実DB・Google・HTTP待受けなしに本番JWT/session callbackと管理APIハンドラーを検証します。削除・無効化・降格・未知roleの拒否、正常管理者の読取り、現在のパスワード変更フラグ、DB障害時の拒否を確認します。本番の実ログイン・停止/降格操作は別途検証が必要です。今回の変更は新しいセッション世代管理や署名鍵交換を導入せず、無効化中のJWTの利用を現在DB状態で拒否する方式です。
