-- AlterTable: users に sourceFolderId 列を追加
-- 録画ファイルの移動元フォルダURL（未設定時は "Meet Recordings" を自動検索）
ALTER TABLE "users" ADD COLUMN "sourceFolderId" TEXT;
