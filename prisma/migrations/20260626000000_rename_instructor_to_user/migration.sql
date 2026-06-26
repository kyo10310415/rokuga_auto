-- UserRole Enum の INSTRUCTOR → USER リネーム
-- PostgreSQL では Enum 値を直接リネームできないため、
-- 一時値を経由して安全に置換する

-- Step 1: 新しい値 USER を追加
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'USER';

-- Step 2: 既存の INSTRUCTOR を USER に更新
UPDATE "users" SET "role" = 'USER' WHERE "role" = 'INSTRUCTOR';

-- Step 3: INSTRUCTOR 値を持つレコードがないことを確認してから
-- Enum 値を削除（PostgreSQL では直接削除できないため型を再作成）
-- 既存の型を削除して再作成する（USER, ADMIN のみ）
ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING "role"::text::"UserRole";

DROP TYPE "UserRole_old";

-- デフォルト値も更新
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';
