-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3);
