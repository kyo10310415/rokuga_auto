-- ユーザーテーブルにファイル移動関連カラムを追加
ALTER TABLE "users" ADD COLUMN "recordingFolderId" TEXT;
ALTER TABLE "users" ADD COLUMN "fileMovingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- システム設定テーブルを新規作成（文字起こし保存先フォルダID等の全体設定）
CREATE TABLE "system_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
