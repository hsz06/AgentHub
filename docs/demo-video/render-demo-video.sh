#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/docs/demo-video"
BUILD_DIR="$OUT_DIR/.render"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD_FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
VIDEO="$OUT_DIR/AgentHub-3min-demo.mp4"
MANIFEST="$OUT_DIR/AgentHub-3min-demo-manifest.txt"

mkdir -p "$BUILD_DIR"
rm -f "$BUILD_DIR"/*.png "$BUILD_DIR"/concat.txt "$VIDEO" "$MANIFEST"

caption_png() {
  local width="$1"
  local height="$2"
  local pointsize="$3"
  local font="$4"
  local color="$5"
  local text="$6"
  local output="$7"
  convert -background none -fill "$color" -font "$font" -pointsize "$pointsize" -size "${width}x${height}" caption:"$text" +repage "$output"
}

make_slide() {
  local index="$1"
  local duration="$2"
  local timebox="$3"
  local title="$4"
  local body="$5"
  local evidence="$6"
  local image="$BUILD_DIR/slide-${index}.png"
  local body_image="$BUILD_DIR/body-${index}.png"
  local evidence_image="$BUILD_DIR/evidence-${index}.png"

  caption_png 1680 360 42 "$FONT" '#2f2b27' "$body" "$body_image"
  caption_png 1580 96 30 "$FONT" '#5f5a51' "$evidence" "$evidence_image"

  convert -size 1920x1080 xc:'#f4f0e6' \
    -fill '#23201d' -font "$BOLD_FONT" -pointsize 78 -gravity NorthWest -annotate +120+96 "$title" \
    -fill '#5f5a51' -font "$FONT" -pointsize 34 -gravity NorthWest -annotate +124+210 "$timebox" \
    -fill '#ffffff' -stroke '#d8d0bd' -strokewidth 3 -draw 'roundrectangle 114,760 1806,970 16,16' \
    -stroke none -fill '#2f2b27' -font "$BOLD_FONT" -pointsize 30 -gravity NorthWest -annotate +150+805 "Acceptance evidence" \
    -fill '#2c2926' -font "$BOLD_FONT" -pointsize 34 -gravity SouthEast -annotate +108+72 "AgentHub" \
    -gravity NorthWest \
    "$body_image" -geometry +124+315 -composite \
    "$evidence_image" -geometry +150+858 -composite \
    "$image"
  printf "file '%s'\n" "$image" >> "$BUILD_DIR/concat.txt"
  printf "duration %s\n" "$duration" >> "$BUILD_DIR/concat.txt"
}

make_slide 01 15 "0:00-0:15" "IM-first Agent workspace" \
"AgentHub starts from a chat surface: sessions, Agent contacts, message stream, approvals, artifacts, and deployments stay in one operational workspace." \
"README quickstart; demo account demo@agenthub.local; session list and chat shell."

make_slide 02 20 "0:15-0:35" "Unified Coding Agent Runtime" \
"Claude Code, Codex, and OpenCode are configured through one runtime adapter layer with local executable paths, permission profiles, and runtime tests." \
"Control Center > CLI Runtimes; CliRuntimeService; agent-platform adapters."

make_slide 03 30 "0:35-1:05" "Single-agent coding task" \
"A single Agent can work against a managed workspace copy, stream progress into the conversation, and return proposed file changes." \
"Managed demo workspace with package.json, server.js, public HTML/CSS/JS."

make_slide 04 25 "1:05-1:30" "Approval-gated file changes" \
"Generated writes do not directly modify the official workspace. Diff approvals show old and new content, then apply only after user approval." \
"ApprovalController; WorkspaceFileService; CodeDiffCard; workspace revisions."

make_slide 05 25 "1:30-1:55" "Multi-Agent orchestration" \
"Group chat routes complex requests through an Orchestrator, persists subtasks, and shows per-Agent task status for collaboration review." \
"Seeded orchestration-demo-run with Codex, Claude, and MiMo completed tasks."

make_slide 06 25 "1:55-2:20" "Inline artifacts and editing" \
"Agent outputs return as inline preview cards: Web iframe, Markdown/document attachment, Slides export, code, versions, and editor flows." \
"message-demo-artifacts; ArtifactController; smoke:delivery validates download, PPTX, versions."

make_slide 07 25 "2:20-2:45" "Deployment and preview URL" \
"Deployment is approval-driven. Static Web artifacts publish to token-protected previews; local Node workspaces run through the Worker with logs and stop/redeploy controls." \
"DeploymentController; LocalProcessExecutor; smoke:delivery, smoke:runtime, smoke:realtime."

make_slide 08 15 "2:45-3:00" "Delivery package" \
"The final package includes product design, implementation architecture, acceptance checklist, AI collaboration record, runnable demo, smoke checks, and this 3-minute video artifact." \
"docs/acceptance-checklist.md; docs/completion-audit.md; docs/ai-collaboration-record.md."

printf "file '%s'\n" "$BUILD_DIR/slide-08.png" >> "$BUILD_DIR/concat.txt"

ffmpeg -y -hide_banner -loglevel error \
  -f concat -safe 0 -i "$BUILD_DIR/concat.txt" \
  -vf "fps=30,scale=1920:1080,format=yuv420p" \
  -c:v libx264 -preset veryfast -tune stillimage -pix_fmt yuv420p \
  "$VIDEO"

cat > "$MANIFEST" <<EOF
AgentHub 3-minute demo video artifact

File: docs/demo-video/AgentHub-3min-demo.mp4
Source script: docs/demo-video-script.md
Renderer: docs/demo-video/render-demo-video.sh
Duration target: 180 seconds
Format: MP4/H.264, 1920x1080, 30fps

This is a generated storyboard demo artifact based on the accepted demo timeline.
It is intended to satisfy the video deliverable when live GUI screen capture is not available.
EOF

ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$VIDEO" >> "$MANIFEST"
echo "Rendered $VIDEO"
