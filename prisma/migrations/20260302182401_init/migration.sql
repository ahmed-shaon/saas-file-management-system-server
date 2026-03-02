-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('IMAGE', 'VIDEO', 'PDF', 'AUDIO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_folders" INTEGER NOT NULL,
    "max_nesting_level" INTEGER NOT NULL,
    "max_file_size_mb" INTEGER NOT NULL,
    "total_file_limit" INTEGER NOT NULL,
    "files_per_folder" INTEGER NOT NULL,
    "allowed_file_types" JSONB NOT NULL,
    "duration_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "depth_level" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "file_type" "FileType" NOT NULL,
    "folder_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_password_reset_token_key" ON "users"("password_reset_token");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_packages_name_key" ON "subscription_packages"("name");

-- CreateIndex
CREATE INDEX "user_subscriptions_user_id_is_active_idx" ON "user_subscriptions"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "folders_user_id_idx" ON "folders"("user_id");

-- CreateIndex
CREATE INDEX "folders_user_id_parent_id_idx" ON "folders"("user_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_stored_name_key" ON "files"("stored_name");

-- CreateIndex
CREATE INDEX "files_user_id_idx" ON "files"("user_id");

-- CreateIndex
CREATE INDEX "files_folder_id_idx" ON "files"("folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_folder_id_original_name_key" ON "files"("folder_id", "original_name");

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "subscription_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "folders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
