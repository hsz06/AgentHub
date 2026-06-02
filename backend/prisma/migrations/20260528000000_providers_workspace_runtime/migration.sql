ALTER TABLE "Agent" ADD COLUMN "tools" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "ProviderConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerType" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "baseURL" TEXT,
  "defaultModel" TEXT,
  "encryptedApiKey" TEXT,
  "userId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProviderConfig_userId_providerType_key" ON "ProviderConfig"("userId", "providerType");

CREATE TABLE "WorkspaceFileRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "baseHash" TEXT,
  "contentHash" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceFileRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceFileRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceFileRevision_workspaceId_filePath_createdAt_idx" ON "WorkspaceFileRevision"("workspaceId", "filePath", "createdAt");

ALTER TABLE "Deployment" ADD COLUMN "containerId" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "exposedPort" INTEGER;
ALTER TABLE "Deployment" ADD COLUMN "runtimeUrl" TEXT;

CREATE TABLE "DeploymentLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deploymentId" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'info',
  "message" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeploymentLog_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeploymentLog_deploymentId_createdAt_idx" ON "DeploymentLog"("deploymentId", "createdAt");

CREATE TABLE "OrchestrationTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "agentId" TEXT,
  "title" TEXT NOT NULL,
  "input" TEXT NOT NULL,
  "output" TEXT,
  "dependencies" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OrchestrationTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "OrchestrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrchestrationTask_runId_status_idx" ON "OrchestrationTask"("runId", "status");
