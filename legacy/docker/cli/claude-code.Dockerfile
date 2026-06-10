FROM node:20-bookworm-slim

RUN npm install -g @anthropic-ai/claude-code \
  && claude --version

WORKDIR /workspace

CMD ["claude", "--version"]
