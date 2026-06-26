-- mustChangePassword カラムを users テーブルに追加
-- 初回ログイン後にパスワード変更を強制するフラグ
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
