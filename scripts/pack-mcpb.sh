#!/usr/bin/env bash
# Builds mouser-<version>.mcpb (Claude Desktop extension bundle) in the repo
# root: manifest.json plus server/ with dist/ and production node_modules.
# Usage: npm run build && bash scripts/pack-mcpb.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(node -p "require('$root/package.json').version")"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

cp "$root/manifest.json" "$stage/"
mkdir -p "$stage/server"
cp -R "$root/dist" "$stage/server/dist"
cp "$root/package.json" "$root/package-lock.json" "$stage/server/"
(cd "$stage/server" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)

npx -y @anthropic-ai/mcpb@2.1.2 pack "$stage" "$root/mouser-$version.mcpb"
echo "built mouser-$version.mcpb"
