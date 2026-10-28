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

## 推移依存の互換更新（2026-10-25）

qsを6.16.1、fast-copyを3.1.0へlockで更新しました。manifest・アプリソース・認証・DB定義・設定は変更しません。Node22.23.4でclean install(ignore-scripts)、Prismaコード生成（DB接続なし）、16テスト、型検査、本番Webpackビルド成功。本番依存auditはCritical/High0、Moderate10→8。Google/uuid、node-cron、Tailwind関連は残存です。fast-copyはpino-pretty側で、確認したloggerは開発時のみpretty transportを使います。全入力経路の非到達を証明したものではありません。実DB・Google・録画・通知は試験していません。

## Googleクライアント更新（2026-10-26）

googleapisを150.0.1へ固定し、旧Google SDKのuuid依存経路を除去しました。APIバージョン・OAuthスコープ・環境変数・DB定義・認証は変更しません。npm auditはCritical/High0、Moderate8→5（cron/uuid、Tailwind関連が残存）。

Node22.23.4、clean install(ignore-scripts)、Prismaコード生成（DB接続なし）、20テスト、型検査、本番Webpackビルド成功。追加4テストでは本番サービス関数と実Google SDKの通信先を模擬し、Calendarページ送り/キャンセル除外、共有Driveのフォルダ作成/親変更、Meet PATCH/既存ON時スキップ/失敗、OAuth refresh成功時の暗号化保存・失敗時statusを確認しました。DBと暗号化/復号、loggerは試験用に置換し、外部HTTP/HTTPS/fetchは禁止。実Google認証・DB・録画・移動・削除・Meet設定は試験実行していません。Nextの非推奨/jose Edge警告は残存します。

## 例外情報の機密保護・未使用cron依存削除（2026-10-26）

Google SDK等の例外をログへ直接展開しないよう、Pinoのerr/errorフィールドと直接Error引数を汎用表現へ置換します。Google連携・Meet/補正/ファイル移動、内部API、管理者の移動テストの失敗本文を固定文にし、OAuth失敗URL・履歴のerrorMessage/errorDetailへ上流例外を保存しません。ステータス・エラーコード・時刻・リトライ回数/間隔は維持します。新しい失敗記録の詳細が減るため、運用では処理イベントと時刻を使って確認してください。既存DB履歴・過去ログは変更/削除しません。通常の業務データや全ログの包括的な匿名化ではありません。

node-cronと@types/node-cronは、追跡コード/スクリプトにimport・requireがないため削除しました。Render cronから内部APIを呼ぶ既存方式とjobsスクリプトは維持し、ジョブ時刻や設定を変更しません。全依存auditはCritical/High0、Moderate5→3（Tailwind関連が残存）。

Node22.23.4でclean install(ignore-scripts)、Prismaコード生成（DB接続なし）、27テスト、型検査、本番ビルドが成功しました。追加試験は実Pinoの出力、内部APIの未認証401/認証済み失敗500、OAuth失敗URL、補正失敗時のリトライ/上限状態と記録内容を検証します。Google更新・Meet失敗試験も機密markerの非出力を検証します。DB・Google・業務ジョブは試験用置換で、本番操作は実行しません。

## Google OAuth連携の利用者照合（2026-10-26）

Google連携の開始時にランダムstateとPKCE verifierを発行し、既存NEXTAUTH_SECRET（未設定時AUTH_SECRET）で署名した10分有効のHttpOnly/SameSite=Lax Cookieへ保存します。HTTPSではSecure Cookie、Pathはコールバックのみ。callbackで現在のDB状態によるログイン確認、署名・state・利用者・期限を検証してからコードを交換し、保存先はログイン中の利用者IDから決めます。PKCEはS256、交換時にverifierを渡します。応答でCookieを消去し、no-store/no-referrerを指定します。

新しい環境変数やDB定義は不要です。既存の認証secretは32文字以上が必要です。既存連携・トークンrefresh・OAuthスコープは維持します。配備前に開始した認証や10分超の認証は最初からやり直してください。同じブラウザーで複数開始すると最新のフローのみが有効です。Cookie削除後の通常の再送は拒否し、認可コード自体の一回性はGoogle側にも依存します。サーバー側の使い捨てnonce DBは追加していません。

Node22.23.4で33テスト・型検査・本番Webpack build成功。state改ざん/期限/将来時刻/別ユーザー/未ログイン/ Cookie欠損/旧ID stateを交換とDB保存前に拒否すること、正常保存・スコープ拒否・提供元失敗・Cookie消去を検証。実Google SDKでS256/redirect URI/verifierのリクエスト形式を模擬HTTPで確認しています。実Google同意・本番DBへの保存は未検証です。

## 新規アカウントの初期パスワード（2026-10-28）

管理画面で作る講師・管理者アカウントの共通初期パスワードを廃止し、作成ごとに暗号学的乱数24バイト（base64url・32文字）を生成します。DBにはbcryptハッシュのみ保存し、初回変更必須は維持します。作成した管理者への201応答だけに平文を返し、no-storeを指定します。一覧・監査ログには含めません。

作成画面はすぐ閉じず、一度だけ表示した初期パスワードを本人確認済みの私的な経路で渡すか安全に控えたことを確認して閉じます。処理中の重複送信・閉じる操作を抑止します。再読み込み・画面離脱・通信切断では再表示できません。作成結果が不明な場合は一覧を確認し、繰り返し作成せず管理者の既存のアカウント復旧手順を利用してください。自動再発行・メール送信は行いません。

この変更は今後の管理画面からの新規作成だけが対象です。既存アカウントのパスワード・セッション、seed処理、本番設定、DB定義は変更しません。既存の初期パスワード未変更アカウントは別途確認・本人確認を伴う対応が必要です。実アカウント作成や本番認証試験は実施していません。
