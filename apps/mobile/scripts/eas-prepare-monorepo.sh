#!/usr/bin/env bash
# EAS: pnpm hoisted monorepo — Expo CLI exige expo em apps/mobile/node_modules.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "${APP_DIR}/../.." && pwd)"

echo "==> EAS monorepo prepare"
echo "    APP_DIR=${APP_DIR}"
echo "    REPO_ROOT=${REPO_ROOT}"

cd "${REPO_ROOT}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "==> Installing pnpm 10.22.0"
  npm install -g pnpm@10.22.0
fi

echo "==> pnpm install (repo root)"
pnpm install --frozen-lockfile

if [ ! -d "${REPO_ROOT}/node_modules/expo" ]; then
  echo "ERROR: expo not found at ${REPO_ROOT}/node_modules/expo" >&2
  echo "node_modules top-level:" >&2
  ls -la "${REPO_ROOT}/node_modules" 2>&1 | head -40 >&2 || true
  exit 1
fi

mkdir -p "${APP_DIR}/node_modules"

link_pkg() {
  local pkg="$1"
  local src="${REPO_ROOT}/node_modules/${pkg}"
  local dest="${APP_DIR}/node_modules/${pkg}"
  if [ ! -e "${src}" ]; then
    echo "WARN: skip missing package ${pkg} at ${src}" >&2
    return 0
  fi
  mkdir -p "$(dirname "${dest}")"
  ln -sfn "${src}" "${dest}"
  echo "    linked ${pkg}"
}

for pkg in expo expo-router expo-constants expo-modules-core react react-native; do
  link_pkg "${pkg}"
done

# Scoped package (optional; prebuild uses expo + pnpm exec).
link_pkg "@expo/cli"

cd "${APP_DIR}"
echo "==> package main=$(node -p "require('./package.json').main")"
echo "==> cwd=$(pwd)"
node -e "console.log('expo sdk', require('expo/package.json').version)"

MAIN="$(node -p "require('./package.json').main")"
case "${MAIN}" in
  index.js|./index.js|expo-router/entry)
    ;;
  *)
    echo "ERROR: apps/mobile/package.json main deve ser index.js ou expo-router/entry (agora: ${MAIN})" >&2
    exit 1
    ;;
esac
