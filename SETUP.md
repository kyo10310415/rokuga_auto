# Meet補正システム セットアップ手順書

> VTuberスクール 運用者向けの実運用セットアップガイドです。

---

## 目次

1. [事前準備・前提条件](#1-事前準備前提条件)
2. [Google Cloud Console設定](#2-google-cloud-console設定)
3. [ローカル開発環境の構築](#3-ローカル開発環境の構築)
4. [データベースのセットアップ](#4-データベースのセットアップ)
5. [初期管理者の作成](#5-初期管理者の作成)
6. [Renderへの本番デプロイ](#6-renderへの本番デプロイ)
7. [Render Cron Jobの設定](#7-render-cron-jobの設定)
8. [GitHubリポジトリの設定](#8-githubリポジトリの設定)
9. [講師のオンボーディング手順](#9-講師のオンボーディング手順)
10. [運用上の注意点と障害対応](#10-運用上の注意点と障害対応)

---

## 1. 事前準備・前提条件

### 必須アカウント・サービス
- [ ] **Google Workspace** アカウント（Enterprise or Business Starter以上 ※録画機能に必要）
- [ ] **Google Cloud Console** アカウント（無料）
- [ ] **GitHub** アカウント
- [ ] **Render** アカウント（Starter以上 ※Cron Jobを使うため）

### ⚠️ 重要な制約事項

> **Google Workspaceプランについて**
> 
> Google Meetの録画機能はGoogle Workspace **Business Starter以上** が必要です。
> 個人Googleアカウントでは録画・文字起こしのAPI設定変更ができません。
> 必ず組織のGoogle Workspaceアカウントで設定を行ってください。

### ローカル開発に必要なもの
- Node.js 20.x 以上
- npm 10.x 以上
- PostgreSQL (ローカル開発用。Dockerでも可)

---

## 2. Google Cloud Console設定

### 2-1. プロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com) にアクセス
2. 「新しいプロジェクト」を作成
   - プロジェクト名: `meet-correction-app` (任意)
3. 作成したプロジェクトを選択

### 2-2. OAuth同意画面の設定

1. 左メニュー「APIとサービス」→「OAuth同意画面」
2. ユーザータイプ: **内部**（Google Workspaceの組織ユーザーのみ）
   - ⚠️ 外部にすると審査が必要になるため「内部」を選択
3. アプリ情報を入力:
   - アプリ名: `Meet補正システム`
   - ユーザーサポートメール: 管理者メールアドレス
   - 開発者連絡先: 管理者メールアドレス
4. スコープを追加:
   ```
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/meetings.space.settings
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   ```
5. 保存して次へ

### 2-3. OAuth 2.0 クライアントIDの作成

1. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth 2.0 クライアントID」
2. アプリケーションの種類: **ウェブアプリケーション**
3. 名前: `meet-correction-app`
4. 承認済みのJavaScript生成元:
   ```
   http://localhost:3000
   https://your-app.onrender.com
   ```
5. 承認済みのリダイレクトURI:
   ```
   http://localhost:3000/api/google/callback
   https://your-app.onrender.com/api/google/callback
   http://localhost:3000/api/auth/callback/google
   https://your-app.onrender.com/api/auth/callback/google
   ```
6. 「作成」→ **クライアントIDとシークレットをメモ**

### 2-4. APIの有効化

「APIとサービス」→「ライブラリ」で以下を検索して有効化:
- ✅ Google Calendar API
- ✅ Google Meet API
- ✅ Google People API（またはoauth2 API）

---

## 3. ローカル開発環境の構築

```bash
# リポジトリをクローン
git clone https://github.com/your-org/meet-correction-app.git
cd meet-correction-app

# 依存パッケージをインストール
npm install

# 環境変数ファイルを作成
cp .env.example .env.local
```

`.env.local` を編集して以下を設定:

```bash
# ローカルDB（PostgreSQLが起動していること）
DATABASE_URL="postgresql://postgres:password@localhost:5432/meet_correction_dev"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Google OAuth（Cloud Consoleで取得した値）
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# 暗号化キー
ENCRYPTION_KEY=$(openssl rand -hex 32)

# 内部APIキー
INTERNAL_API_KEY=$(openssl rand -hex 32)

# アプリURL
APP_URL="http://localhost:3000"

# 初期管理者（seed用）
ADMIN_EMAIL="admin@yourschool.com"
ADMIN_PASSWORD="Admin@SecurePass123!"
```

```bash
# Prismaクライアント生成
npm run db:generate

# DBマイグレーション実行
npm run db:migrate:dev

# 初期管理者を作成
npm run db:seed

# 開発サーバー起動
npm run dev
```

ブラウザで http://localhost:3000 を開く。

---

## 4. データベースのセットアップ

### 新規マイグレーション追加時

```bash
# マイグレーションファイルを作成（変更内容を説明する名前をつける）
npx prisma migrate dev --name add_new_feature

# マイグレーション状態確認
npx prisma migrate status
```

### DBリセット（ローカル開発のみ）

```bash
npx prisma migrate reset
npm run db:seed
```

### Prisma Studio（DBのGUI）

```bash
npm run db:studio
```

---

## 5. 初期管理者の作成

### 方法1: seedスクリプト（初回のみ）

`.env.local` または環境変数に `ADMIN_EMAIL` と `ADMIN_PASSWORD` を設定してから:

```bash
npm run db:seed
```

### 方法2: 既存管理者がDBを直接操作

```sql
-- 本番DBへの緊急管理者追加（Renderのコンソールから実行）
-- ※ パスワードは bcrypt でハッシュ化されたものが必要
```

### 講師アカウントの追加

講師は自分でGoogleログインするため、事前登録は不要です。
ただし、講師ロール（INSTRUCTOR）でユーザーを作成する場合は管理者が行います。

1. 管理ダッシュボードにログイン
2. （将来実装）講師招待メールを送信
3. 講師がGoogleログインでアカウント作成後、管理者がロール確認

---

## 6. Renderへの本番デプロイ

### 6-1. PostgreSQLデータベースを作成

1. Renderダッシュボード → 「New +」→「PostgreSQL」
2. 設定:
   - Name: `meet-correction-db`
   - Region: `Oregon (US West)` （または最寄りのリージョン）
   - Plan: `Starter` ($7/月)
3. 作成後、「Connection」タブの `Internal Database URL` をメモ

### 6-2. Webサービスを作成

1. Renderダッシュボード → 「New +」→「Web Service」
2. GitHubリポジトリと連携
3. 設定:
   - Name: `meet-correction-app`
   - Runtime: `Node`
   - Build Command: `npm install && npm run db:generate && npm run build`
   - Start Command: `npm run db:migrate && npm start`
   - Plan: `Starter` ($7/月)

4. 環境変数を設定（すべて必須）:

| 変数名 | 値 | 説明 |
|--------|-----|------|
| `DATABASE_URL` | Renderで取得したURL | PostgreSQL接続文字列 |
| `NEXTAUTH_URL` | `https://your-app.onrender.com` | アプリのURL |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` の出力 | セッション暗号化 |
| `GOOGLE_CLIENT_ID` | Cloud Consoleで取得 | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Cloud Consoleで取得 | Google OAuth |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` の出力 | トークン暗号化 |
| `INTERNAL_API_KEY` | `openssl rand -hex 32` の出力 | Cron Job認証 |
| `APP_URL` | `https://your-app.onrender.com` | 内部API呼び出し用 |
| `NODE_ENV` | `production` | 本番環境フラグ |

5. 「Create Web Service」で作成

### 6-3. デプロイ後の確認

```bash
# デプロイログを確認
# Renderダッシュボード → サービス選択 → Logs タブ

# 動作確認
curl https://your-app.onrender.com/api/health  # (実装する場合)
```

---

## 7. Render Cron Jobの設定

Renderではメインサービスとは別に「Cron Job」サービスを作成します。

### 7-1. イベントスキャンジョブ（5分ごと）

1. 「New +」→「Cron Job」
2. 設定:
   - Name: `meet-scan-events`
   - Schedule: `*/5 * * * *` (5分ごと)
   - Command:
     ```bash
     curl -X POST $APP_URL/api/internal/scan-events \
       -H "Authorization: Bearer $INTERNAL_API_KEY" \
       -H "Content-Type: application/json" \
       --fail --silent --show-error
     ```
3. 環境変数: `APP_URL`, `INTERNAL_API_KEY` を設定

### 7-2. 開始前再確認ジョブ（5分ごと）

1. 「New +」→「Cron Job」
2. 設定:
   - Name: `meet-pre-check`
   - Schedule: `*/5 * * * *` (5分ごと)
   - Command:
     ```bash
     curl -X POST $APP_URL/api/internal/pre-check \
       -H "Authorization: Bearer $INTERNAL_API_KEY" \
       -H "Content-Type: application/json" \
       --fail --silent --show-error
     ```

### 7-3. トークンリフレッシュジョブ（1時間ごと）

1. 「New +」→「Cron Job」
2. 設定:
   - Name: `meet-refresh-tokens`
   - Schedule: `0 * * * *` (毎時0分)
   - Command:
     ```bash
     curl -X POST $APP_URL/api/internal/refresh-tokens \
       -H "Authorization: Bearer $INTERNAL_API_KEY" \
       -H "Content-Type: application/json" \
       --fail --silent --show-error
     ```

---

## 8. GitHubリポジトリの設定

```bash
# リポジトリ初期化
cd meet-correction-app
git init
git add .
git commit -m "Initial commit: Meet補正システム MVP"

# GitHubリポジトリを作成（プライベート推奨）
gh repo create meet-correction-app --private --source=. --remote=origin --push

# または手動でリモートを追加
git remote add origin https://github.com/your-org/meet-correction-app.git
git push -u origin main
```

### ブランチ戦略（推奨）

```
main          本番デプロイ用
develop       開発統合ブランチ
feature/*     機能追加
fix/*         バグ修正
```

### Renderとの自動デプロイ設定

RenderのWeb ServiceでGitHubリポジトリを連携すると:
- `main`ブランチへのPushで自動デプロイ
- Pull RequestのPreview Deploymentsも可能（Paidプラン）

---

## 9. 講師のオンボーディング手順

講師が自分でセットアップする手順:

1. **管理者が講師アカウントを作成する**
   - 現在のMVPでは管理者がDBにユーザーを追加するか、
     講師に自分でGoogleログインしてもらい、管理者がロールをINSTRUCTORに変更

2. **講師がログイン**
   - アプリURL にアクセス
   - 「Googleでログイン」をクリック
   - 自分の講師用Googleアカウントでログイン

3. **Google連携の実施**
   - マイページに移動
   - 「Googleアカウントを連携する」をクリック
   - 権限の確認画面で **「すべて許可」** をクリック
   - ⚠️ 「カレンダーの読み取り」と「Meet会議設定の更新」の両方が必要

4. **動作確認**
   - マイページで「連携中」のステータスが表示されることを確認
   - 5分後に自動スキャンが走り、今後の予定が表示される

---

## 10. 運用上の注意点と障害対応

### 日常監視ポイント

| 確認項目 | 確認方法 | 対応方法 |
|----------|----------|----------|
| 補正失敗件数 | 管理ダッシュボード | 手動再実行 |
| トークン期限切れ | 管理ダッシュボード | 該当講師に再連携依頼 |
| Cronジョブ実行 | RenderのLogs | エラー確認・手動実行 |

### トークン期限切れ時の対応

1. 管理ダッシュボード →「講師管理」でステータスを確認
2. 「TOKEN_EXPIRED」の講師に連絡
3. 講師がマイページで「再連携する」をクリック
4. 連携完了後、失敗した補正ジョブを管理者が手動再実行

### 補正失敗時のエスカレーション

```
補正失敗検知
  ↓ (Pendingジョブが残る)
5回リトライ（2分, 5分, 15分, 30分, 60分間隔）
  ↓ (全リトライ失敗)
FAILEDステータスに変更
  ↓
管理者がダッシュボードで確認
  ↓
手動再実行 or 講師に手動設定を依頼
```

### Meet API接続エラー時

エラーメッセージに応じた対応:

| エラー | 原因 | 対応 |
|--------|------|------|
| `403 Forbidden` | Workspace契約なし or 権限不足 | Workspaceプランと権限確認 |
| `404 Not Found` | Spaceが存在しない | Meetリンクの有効性確認 |
| `401 Unauthorized` | トークン失効 | 再連携 |
| `429 Too Many Requests` | APIレート制限 | 時間をおいて再試行 |

### バックアップ

```bash
# DBバックアップ（Renderのバックアップ機能またはpg_dump）
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### ログの確認

- **Renderダッシュボード**: サービス → Logs タブ
- **Cron Jobのログ**: 各Cron Job → Logs タブ
- **DBのクエリログ**: Prismaが `error`レベル以上を出力

---

## セキュリティ注意事項

1. **`ENCRYPTION_KEY` は絶対に変更しない**
   変更すると全ユーザーのOAuthトークンが復号不能になり、全員の再連携が必要になる

2. **`NEXTAUTH_SECRET` を外部に漏らさない**
   漏れた場合はすぐに変更し、全ユーザーを強制ログアウト

3. **`INTERNAL_API_KEY` は定期的にローテーション**
   Cron JobとWebサーバーの両方を同時に更新すること

4. **GitHubに環境変数をコミットしない**
   `.env.local`, `.env.production` などは`.gitignore`で除外済み

---

## よくある質問

**Q: 録画がONになったか確認する方法は？**
A: 管理ダッシュボードの補正履歴で「成功」ステータスを確認。または講師ダッシュボードでイベントの状態が「補正済み」であることを確認。

**Q: 会議中に設定が変わってしまった場合は？**
A: 開始前再確認ジョブが5分ごとに再確認して再補正します。それでも失敗する場合は管理者が手動再実行してください。

**Q: 講師が誤って連携を解除してしまった場合は？**
A: マイページから再連携ができます。再連携後、管理者が補正失敗ジョブを手動再実行してください。

**Q: 新しい講師を追加する方法は？**
A: 現在のMVPでは講師が自分でGoogleログインし、管理者がDBでロールをINSTRUCTORに変更します。将来的には招待機能を実装予定。
