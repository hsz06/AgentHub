CREATE TABLE "CliRuntimeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runtimeType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "dockerImage" TEXT NOT NULL,
    "commandTemplate" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "encryptedApiKey" TEXT,
    "envVarName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CliRuntimeConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CliRuntimeConfig_userId_runtimeType_key" ON "CliRuntimeConfig"("userId", "runtimeType");

CREATE TABLE "CliRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "prompt" TEXT NOT NULL,
    "stdout" TEXT NOT NULL DEFAULT '',
    "stderr" TEXT NOT NULL DEFAULT '',
    "result" TEXT,
    "baseSnapshot" TEXT NOT NULL DEFAULT '{}',
    "diffSummary" TEXT NOT NULL DEFAULT '[]',
    "messageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "CliRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CliRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CliRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CliRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CliRun_userId_status_idx" ON "CliRun"("userId", "status");
CREATE INDEX "CliRun_conversationId_createdAt_idx" ON "CliRun"("conversationId", "createdAt");
