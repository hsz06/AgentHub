FROM node:20-bookworm-slim

RUN npm install -g @openai/codex \
  && codex --version

WORKDIR /workspace

CMD ["codex", "--version"]
