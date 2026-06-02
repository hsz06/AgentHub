ALTER TABLE "User" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
UPDATE "User" SET "email" = "id" || '@legacy.local' WHERE "email" = '';
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Agent" ADD COLUMN "model" TEXT;
ALTER TABLE "Agent" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Agent_userId_idx" ON "Agent"("userId");

ALTER TABLE "Conversation" ADD COLUMN "summary" TEXT;
CREATE INDEX "Conversation_userId_lastActiveAt_idx" ON "Conversation"("userId", "lastActiveAt");

ALTER TABLE "Message" ADD COLUMN "agentId" TEXT REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD COLUMN "quotedMessageId" TEXT;
ALTER TABLE "Message" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed';
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

CREATE UNIQUE INDEX "ConversationMember_conversationId_agentId_key" ON "ConversationMember"("conversationId", "agentId");

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "rootPath" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Workspace_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Workspace_userId_idx" ON "Workspace"("userId");

CREATE TABLE "Artifact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "mimeType" TEXT,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Artifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Artifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Artifact_userId_idx" ON "Artifact"("userId");

CREATE TABLE "ArtifactVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "artifactId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "messageId" TEXT,
  CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ArtifactVersion_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ArtifactVersion_artifactId_version_key" ON "ArtifactVersion"("artifactId", "version");

CREATE TABLE "Deployment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_approval',
  "previewUrl" TEXT,
  "logs" TEXT NOT NULL DEFAULT '',
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "artifactId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Deployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Deployment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Deployment_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Deployment_userId_status_idx" ON "Deployment"("userId", "status");

CREATE TABLE "ToolApproval" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "result" TEXT,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "deploymentId" TEXT,
  "resolvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ToolApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ToolApproval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ToolApproval_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ToolApproval_userId_status_idx" ON "ToolApproval"("userId", "status");

CREATE TABLE "OrchestrationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "request" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT '{}',
  "result" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OrchestrationRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrchestrationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrchestrationRun_conversationId_createdAt_idx" ON "OrchestrationRun"("conversationId", "createdAt");
