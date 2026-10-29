#!/bin/sh
# Runs the test suite on Linux x64, the platform Vercel runs, so its ffmpeg-static binary (ffmpeg 7, not the Mac's 6)
# is the one under test. Only tracked files are copied in; node_modules is installed fresh inside the container.
set -eu
cd "$(dirname "$0")/.."
git ls-files -z | tar --null -T - -czf - | docker run --rm -i --platform linux/amd64 node:22 sh -ec '
  mkdir /app && cd /app && tar -xzf -
  corepack enable >/dev/null 2>&1
  pnpm install --frozen-lockfile --silent
  pnpm vitest run
'
