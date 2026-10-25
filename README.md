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

## 依存セキュリティ更新（2026-10-23）

既存manifestの互換範囲内で、lockfileのNext.jsを15.5.28、next-authを5.0.0-beta.32、Auth.js coreを0.41.3、Prisma adapterを2.11.3へ更新しました。画像処理の[Next.js脆弱性](https://github.com/advisories/GHSA-2464-fhr4-w9xw)と、設定エラー時の[Auth.js認証判定不備](https://github.com/advisories/GHSA-8fpg-xm3f-6cx3)等を修正する版です。sharpやCSS/解析ツールの互換更新も含みます。認証・権限・DB schema・設定変数は変更しません。配備中に開始したOAuthログインが失敗した場合は、新しくログインを開始してください。

隔離したローカル環境で、インストールスクリプトを無効にした再インストール、Prismaコード生成、型検査、本番ビルド、認可・JWTの11テストが成功しました。実DB・Google・録画・通知は未実行です。ビルドにはAuth.jsが使用するjoseのCompressionStream/DecompressionStreamに関するEdge警告が残り、実環境のログインは別途確認が必要です。

npm auditはCritical 4→0、High 14→8、Moderate 10件です。残るHighは、修正版未公開のbracesを使用するTailwind/ESLint周辺と、Next.js内部に固定されたPostCSSです。依存件数を外部から成立する攻撃件数と同一視していません。Tailwind/Nextのメジャー移行やoverrideはこの更新に含めず、引き続き対応が必要です。

## 依存セキュリティ更新（2026-10-25）

Next.js 16.4.3 / Zod 4.6.7へ更新しました。Node.js 20.9以上が必要です（検証は22.23.4）。React18とWebpackは維持し、開発・本番ビルドは明示的にWebpackを使います。lintはNext.jsコマンドからESLint9のflat configへ移行しました。Zodの入力エラーはissuesで取得します。環境変数・DBスキーマ・認可方針は変更しません。

認証JWT・権限・middleware・入力検証の16テスト、型チェック、本番ビルドが成功しました。lintはエラー0、既存prisma.tsの不要なdisableコメントの警告1です。React18・middleware・images.domainsの非推奨警告とjoseのEdge警告は残ります。実Googleログインと録画処理は別途検証が必要です。npm auditはCritical0/High0/Moderate10であり、全問題の解消を意味しません。
