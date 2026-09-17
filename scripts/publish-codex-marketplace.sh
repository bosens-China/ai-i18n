#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/dist/codex-marketplace"
if [[ ! -f "$src/.agents/plugins/marketplace.json" || ! -d "$src/plugins/ai-i18n" ]]; then
  echo '缺少市场产物，请先运行 pnpm plugins:build / Missing marketplace bundle; run pnpm plugins:build first' >&2
  exit 1
fi

# 防止 Skills 单独发布时引用尚未上 npm 的 MCP 版本。
mcp="$(node -p "require(process.argv[1]).mcpServers['ai-i18n'].args[1]" "$src/plugins/ai-i18n/.mcp.json")"
npm view "$mcp" version --registry=https://registry.npmjs.org/ > /dev/null

token="${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
auth="$(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp -R "$src"/. "$work/"
cd "$work"
git init --quiet
git checkout --quiet -b plugin-marketplace
git add -A
git \
  -c user.name='github-actions[bot]' \
  -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit --quiet --allow-empty -m 'chore: publish Codex plugin marketplace'
git \
  -c http.extraheader="AUTHORIZATION: basic ${auth}" \
  push --quiet --force "https://github.com/${repo}.git" plugin-marketplace
