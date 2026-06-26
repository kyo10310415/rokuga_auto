-- UserRole Enum の INSTRUCTOR → USER リネーム
-- PostgreSQL の ADD VALUE はトランザクション内で使用不可 (error 55P04) のため、
-- 型を丸ごと置換するアプローチを採用（ADD VALUE を一切使わない）
--
-- 重要: ALTER COLUMN TYPE の前に DROP DEFAULT が必須
--   → デフォルト値が旧型のまま残っていると 42804 エラーになる

-- Step 1: デフォルト値を先に削除（型変換の妨げになるため）
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

-- Step 2: 既存の Enum 型を旧名にリネーム
ALTER TYPE "UserRole" RENAME TO "UserRole_old";

-- Step 3: 新しい型を作成（INSTRUCTOR を除外し USER を追加）
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- Step 4: カラムを新しい型に変換
--   USING: INSTRUCTOR → USER、ADMIN → ADMIN にマッピング
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING CASE "role"::text
    WHEN 'INSTRUCTOR' THEN 'USER'::"UserRole"
    WHEN 'ADMIN'      THEN 'ADMIN'::"UserRole"
    ELSE                   'USER'::"UserRole"
  END;

-- Step 5: デフォルト値を新しい型で再設定
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";

-- Step 6: 旧型を削除
DROP TYPE "UserRole_old";
