#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script: package-extension-bundle.sh
# Purpose: Build Next.js standalone server and package it directly inside the
#          Klystr VS Code extension (.vsix) for self-contained distribution.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXT_DIR="${ROOT_DIR}/vscode-extension"
SERVER_TARGET="${EXT_DIR}/server"

echo "============================================================"
echo "  Klystr: Bundling Self-Contained VS Code Extension"
echo "============================================================"
echo "Project Root: ${ROOT_DIR}"
echo "Extension Dir: ${EXT_DIR}"
echo ""

cd "${ROOT_DIR}"

# 1. Build Next.js application with standalone output
echo "==> [1/4] Building Next.js application (standalone)..."
npm run build

if [ ! -f "${ROOT_DIR}/.next/standalone/server.js" ]; then
  echo "Error: Next.js standalone build failed; .next/standalone/server.js not found." >&2
  exit 1
fi

# 2. Build VS Code extension TypeScript bundle
echo "==> [2/4] Building extension bundle with esbuild..."
npm run extension:build

# 3. Stage standalone files inside vscode-extension/server
echo "==> [3/4] Staging standalone server files into ${SERVER_TARGET}..."
rm -rf "${SERVER_TARGET}"
mkdir -p "${SERVER_TARGET}"

# Copy standalone runtime and dependencies
cp -a "${ROOT_DIR}/.next/standalone/." "${SERVER_TARGET}/"

# Ensure static assets and public directory are in place
mkdir -p "${SERVER_TARGET}/.next/static"
if [ -d "${ROOT_DIR}/.next/static" ]; then
  cp -a "${ROOT_DIR}/.next/static/." "${SERVER_TARGET}/.next/static/"
fi

if [ -d "${ROOT_DIR}/public" ]; then
  mkdir -p "${SERVER_TARGET}/public"
  cp -a "${ROOT_DIR}/public/." "${SERVER_TARGET}/public/"
fi

echo "Staged standalone server successfully ($(du -sh "${SERVER_TARGET}" | cut -f1))"

# 4. Package extension with @vscode/vsce
echo "==> [4/4] Packaging VSIX extension..."
cd "${EXT_DIR}"

# Package extension into .vsix (allow-package-secrets for mock fixture false positives)
npx --yes @vscode/vsce package --no-git-tag-version --allow-package-secrets slack "$@"

VSIX_FILE=$(ls -t "${EXT_DIR}"/*.vsix | head -n 1)

echo ""
echo "============================================================"
echo "  Packaging Complete!"
echo "============================================================"
echo "Generated VSIX: ${VSIX_FILE}"
echo "Package Size:   $(du -h "${VSIX_FILE}" | cut -f1)"
echo ""
echo "To install and test locally on any machine/remote:"
echo "  code --install-extension ${VSIX_FILE}"
echo ""
echo "To publish to the VS Code Marketplace:"
echo "  cd vscode-extension && npx @vscode/vsce publish -p <YOUR_PAT_TOKEN>"
echo "============================================================"
