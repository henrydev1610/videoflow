-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "AnonymousContext" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnonymousContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaInspection" (
    "id" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "availableFormats" TEXT[],
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadJob" (
    "id" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "format" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressIndeterminate" BOOLEAN NOT NULL DEFAULT true,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "cancelRequestedAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "historyExpiresAt" TIMESTAMP(3) NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "DownloadJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadAttempt" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL,
    "generation" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "DownloadAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileArtifact" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "jobId" UUID NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaCounter" (
    "key" TEXT NOT NULL,
    "active" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotaCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousContext_tokenHash_key" ON "AnonymousContext"("tokenHash");

-- CreateIndex
CREATE INDEX "AnonymousContext_expiresAt_idx" ON "AnonymousContext"("expiresAt");

-- CreateIndex
CREATE INDEX "MediaInspection_expiresAt_idx" ON "MediaInspection"("expiresAt");

-- CreateIndex
CREATE INDEX "MediaInspection_contextId_id_idx" ON "MediaInspection"("contextId", "id");

-- CreateIndex
CREATE INDEX "DownloadJob_contextId_createdAt_id_idx" ON "DownloadJob"("contextId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DownloadJob_contextId_status_createdAt_idx" ON "DownloadJob"("contextId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DownloadJob_status_leaseExpiresAt_idx" ON "DownloadJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "DownloadJob_historyExpiresAt_idx" ON "DownloadJob"("historyExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadAttempt_jobId_sequence_key" ON "DownloadAttempt"("jobId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FileArtifact_jobId_key" ON "FileArtifact"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "FileArtifact_storageKey_key" ON "FileArtifact"("storageKey");

-- CreateIndex
CREATE INDEX "FileArtifact_expiresAt_idx" ON "FileArtifact"("expiresAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_deliveredAt_createdAt_idx" ON "OutboxEvent"("deliveredAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_jobId_generation_type_key" ON "OutboxEvent"("jobId", "generation", "type");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_contextId_key_key" ON "IdempotencyRecord"("contextId", "key");

-- AddForeignKey
ALTER TABLE "MediaInspection" ADD CONSTRAINT "MediaInspection_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "AnonymousContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadJob" ADD CONSTRAINT "DownloadJob_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "AnonymousContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadAttempt" ADD CONSTRAINT "DownloadAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DownloadJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileArtifact" ADD CONSTRAINT "FileArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DownloadJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DownloadJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "AnonymousContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DownloadJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
