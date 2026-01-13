#!/usr/bin/env bash
set -euo pipefail

# Generate/refresh a Trusted Web Activity APK wrapper using Bubblewrap.
# Requirements:
#   - node/npm available
#   - npx can install @bubblewrap/cli (or add it to devDependencies)
#   - A valid signing keystore at path set in bubblewrap-config.json (default: ./android-signing-key.keystore)
#
# Usage:
#   TWA_MANIFEST_URL="https://esmee.i234.me/manifest.json" ./scripts/generate-twa.sh
#   # or edit bubblewrap-config.json defaults before running.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

CONFIG="$ROOT_DIR/bubblewrap-config.json"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required (install Node.js)" >&2
  exit 1
fi

MANIFEST_URL="${TWA_MANIFEST_URL:-}"
if [ -n "$MANIFEST_URL" ]; then
  jq --arg url "$MANIFEST_URL" '.webManifestUrl = $url' "$CONFIG" >"$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"
  echo "Using manifest: $MANIFEST_URL"
else
  echo "Using manifest from bubblewrap-config.json (set TWA_MANIFEST_URL to override)."
fi

echo "Initializing Bubblewrap project..."
npx @bubblewrap/cli init --manifest "$(jq -r '.webManifestUrl' "$CONFIG")" --config "$CONFIG" || true

echo "Building TWA APK..."
npx @bubblewrap/cli build --config "$CONFIG"

echo "Done. APK should be in ./android/app/build/outputs/apk/release/ (if signing key is configured)."
