#!/usr/bin/env bash
# Connects this game repository to game_platform, whose tools build, check and package the game.
# The game lives here (games/<id>); the platform is cloned next to this repository (or wherever GP_PLATFORM points) and
# remembered in .gp-platform, and its node_modules are linked so the type checker and vitest resolve `@gp/core`.
# A game's own npm dependencies (an engine: games/<id>/package.json) are installed into games/<id>/node_modules.
# Usage: scripts/setup.sh   (or GP_PLATFORM=/path/to/game_platform scripts/setup.sh)   then   scripts/gp.sh <command>
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="${GP_PLATFORM:-$HERE/../game_platform}"
if [ ! -e "$PLATFORM/.git" ]; then   # (a file in a git worktree)
  git clone --depth 1 https://github.com/QmaCyber/game_platform "$PLATFORM"
fi
PLATFORM="$(cd "$PLATFORM" && pwd)"
# Install only when missing: never rewrite a platform checkout someone else is using
if [ ! -d "$PLATFORM/node_modules" ]; then
  (cd "$PLATFORM" && npm ci --no-audit --no-fund)
fi
# A platform pulled since its npm ci may have a new package of its own (@gp/physics) without its node_modules link: add
# the missing links (what npm does for a workspace), never touching what is there
for p in "$PLATFORM"/packages/*/package.json; do
  name="$(basename "$(dirname "$p")")"
  if [ -d "$PLATFORM/node_modules/@gp" ] && [ ! -e "$PLATFORM/node_modules/@gp/$name" ]; then ln -s "../../packages/$name" "$PLATFORM/node_modules/@gp/$name"; fi
done
echo "$PLATFORM" > "$HERE/.gp-platform"
# A real node_modules folder here (an `npm install` at this root by mistake) would swallow the link: replace it. Never
# remove the link by hand (`rm node_modules`): it points into the platform, and ln -sfn below replaces it anyway
if [ -d "$HERE/node_modules" ] && [ ! -L "$HERE/node_modules" ]; then rm -rf "$HERE/node_modules"; fi
ln -sfn "$PLATFORM/node_modules" "$HERE/node_modules"
echo "✓ platform at $PLATFORM (remembered in .gp-platform), node_modules linked"
# Which platform the checks come from: an older checkout misses the checks added since (gp qa names it in qa/report.md)
if commit="$(git -C "$PLATFORM" log -1 --format='%h from %cs' 2>/dev/null)"; then
  echo "  platform commit $commit — the latest checks: git -C \"$PLATFORM\" pull --ff-only (then scripts/setup.sh again)"
fi
# Each game's own npm dependencies, in its own folder: never `npm install` at this repository's root, whose node_modules
# is the platform's (linked above)
for pkg in "$HERE"/games/*/package.json; do
  [ -f "$pkg" ] || continue
  dir="$(dirname "$pkg")"
  if [ -f "$dir/package-lock.json" ]; then (cd "$dir" && npm ci --no-audit --no-fund); else (cd "$dir" && npm install --no-audit --no-fund); fi
  echo "✓ $(basename "$dir"): its npm dependencies installed in games/$(basename "$dir")/node_modules"
done
