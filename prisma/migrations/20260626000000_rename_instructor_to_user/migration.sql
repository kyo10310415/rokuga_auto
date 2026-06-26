-- UserRole Enum の INSTRUCTOR → USER リネーム
-- PostgreSQL の ADD VALUE はトランザクション内で使用不可 (error 55P04) のため、
-- 型を丸ごと置換するアプローチを採用（ADD VALUE を一切使わない）

-- Step 1: 既存の Enum 型を旧名にリネーム
ALTER TYPE "UserRole" RENAME TO "UserRole_old";

-- Step 2: 新しい型を作成（INSTRUCTOR を除外し USER を追加）
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- Step 3: カラムを新しい型に変換
--   USING: INSTRUCTOR → USER、ADMIN → ADMIN にマッピング
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING CASE "role"::text
    WHEN 'INSTRUCTOR' THEN 'USER'::"UserRole"
    WHEN 'ADMIN'      THEN 'ADMIN'::"UserRole"
    ELSE                   'USER'::"UserRole"
  END;

-- Step 4: デフォルト値を新しい型で再設定
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";

-- Step 5: 旧型を削除
DROP TYPE "UserRole_old";
