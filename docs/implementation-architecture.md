# AgentHub Full-Flow Architecture

## Runtime Layout

- `web`: React/PWA client for chat, artifacts, workspaces, approvals, and deployments.
- `api`: Express, Socket.io, Prisma, JWT authentication, BYOK encryption, preview proxy.
- `worker`: the only Compose service mounting the Docker socket; consumes approved command and full-stack deployment queues.
- `electron`: loads the Web UI and exposes controlled directory import, artifact export, and notification APIs.

SQLite and managed workspace data are persisted in Docker volumes for the local acceptance environment.

## Security Boundaries

- Provider keys saved through the UI are encrypted with AES-256-GCM using `ENCRYPTION_KEY`; API responses expose only configured state. Backend environment variables can supply provider defaults for local smoke tests or single-user demos, while database BYOK takes precedence.
- Every Agent, conversation, workspace, artifact, approval, and deployment query is scoped to `userId`.
- ZIP import is extracted only under the managed workspace root with traversal checks, entry limits, and size limits.
- Model-generated writes, commands, and deployments become approvals. The API never runs generated shell commands.
- Only allowlisted commands are queued: `npm install`, `npm run build`, `npm test`, `npm run test`, `npm run lint`.
- Full-stack deployment requires a root `Dockerfile`; Docker execution occurs in `worker` with CPU, memory, PID, read-only filesystem, and no-new-privileges controls.
- Static publication pins an exact `ArtifactVersion`. Preview iframes have no same-origin permission and apply restrictive CSP.

## REST API

| Area | Endpoints |
| --- | --- |
| Auth | `/api/auth/register`, `/login`, `/me` |
| Providers | `/api/settings/providers`, `/api/settings/providers/:provider/test` |
| Chat | `/api/agents`, `/api/conversations`, `/api/messages` |
| Orchestration | `/api/conversations/:id/orchestrations` |
| Workspaces | `/api/workspaces`, `/:id/tree`, `/:id/file`, `/:id/import`, `/:id/export` |
| Artifacts | `/api/artifacts`, `/:id/versions`, `/:id/download`, `/:id/export/pptx` |
| Approvals | `/api/approvals`, `/:id/resolve` |
| Deployments | `/api/deployments`, `/:id/logs`, `/:id/stop`, `/:id/redeploy` |

## Socket Protocol

Client events:

- `conversation:join`
- `message:send`
- `message:regenerate`
- `orchestration:cancel`

Server events:

- `message:created`, `message:chunk`, `message:completed`
- `orchestration:state`, `task:state`
- `tool:approval-created`, `tool:result`
- `deployment:state`
- `error`

Docker worker status is persisted to deployments/logs and refreshed by clients because the worker is intentionally isolated from the API Socket process.

## Agent Tools

Agents are provided only their configured permission set. Tool proposals use a fenced JSON envelope:

````text
```agenthub-tool
{"tool":"propose_file_change","workspaceId":"...","filePath":"src/app.ts","baseHash":"...","content":"..."}
```
````

Read tools, `list_workspace_files` and `read_workspace_file`, execute automatically after permission validation and feed results back to the Agent. `propose_file_change`, `propose_command`, and `propose_deployment` always produce approval records. A conflicting file base creates a model-assisted merge candidate that still requires approval.

## Orchestration

A group request creates an `OrchestrationRun`. The lead Agent attempts to produce a JSON task dependency graph; a deterministic independent-task fallback is used if planning is unavailable. Ready tasks execute in parallel, dependency outputs are supplied downstream, task states persist, and a summary message closes the run. Tasks containing approval proposals transition to `waiting_approval`, and resolution messages are inserted into the conversation audit trail.
