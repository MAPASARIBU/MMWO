-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "mill_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_mill_id_fkey" FOREIGN KEY ("mill_id") REFERENCES "mills" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mills" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "stations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mill_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stations_mill_id_fkey" FOREIGN KEY ("mill_id") REFERENCES "mills" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "station_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "equipment_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wo_no" TEXT NOT NULL,
    "mill_id" INTEGER NOT NULL,
    "station_id" INTEGER NOT NULL,
    "equipment_id" INTEGER,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "assignee_id" INTEGER,
    "target_start" DATETIME,
    "target_finish" DATETIME,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "verified_at" DATETIME,
    "closed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "work_orders_mill_id_fkey" FOREIGN KEY ("mill_id") REFERENCES "mills" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "work_orders_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "work_orders_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "work_orders_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "work_orders_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wo_attachments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wo_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by" INTEGER,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wo_attachments_wo_id_fkey" FOREIGN KEY ("wo_id") REFERENCES "work_orders" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wo_comments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wo_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wo_comments_wo_id_fkey" FOREIGN KEY ("wo_id") REFERENCES "work_orders" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "wo_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wo_audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wo_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wo_audit_logs_wo_id_fkey" FOREIGN KEY ("wo_id") REFERENCES "work_orders" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "wo_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "weekly_plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wo_id" INTEGER NOT NULL,
    "planned_week" TEXT NOT NULL,
    "planned_day" TEXT,
    "planned_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weekly_plan_wo_id_fkey" FOREIGN KEY ("wo_id") REFERENCES "work_orders" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "weekly_plan_planned_by_fkey" FOREIGN KEY ("planned_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_wo_no_key" ON "work_orders"("wo_no");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_plan_wo_id_key" ON "weekly_plan"("wo_id");
