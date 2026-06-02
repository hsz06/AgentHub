ALTER TABLE "OrchestrationRun" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "OrchestrationTask" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "OrchestrationTask" ADD COLUMN "completedAt" DATETIME;
