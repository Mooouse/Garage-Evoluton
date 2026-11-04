#!/usr/bin/env bash
# Runs a game_platform command on a game of this repository:
#   scripts/gp.sh validate · story · qa [--quick] · dev · balance · uniqueness · build --target crazygames · covers · video · review · submission
# One game in games/: it is the one. Several: name it first — scripts/gp.sh qa <id> --quick (an id from games/, or a path).
# Commands about the platform take no game: scripts/gp.sh explain money · catalog · doctor · forecast --idea …
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if [ $# -lt 1 ]; then
  echo "Usage: scripts/gp.sh <command> [game] [flags]   e.g. scripts/gp.sh qa --quick   (commands: scripts/gp.sh help)"
  exit 1
fi
PLATFORM="${GP_PLATFORM:-$(cat "$HERE/.gp-platform" 2>/dev/null || echo "$HERE/../game_platform")}"
if [ ! -f "$PLATFORM/packages/cli/src/gp.ts" ]; then
  echo "game_platform not found at $PLATFORM: run scripts/setup.sh first (or set GP_PLATFORM=/path/to/game_platform)"
  exit 1
fi
cmd="$1"; shift
gp() { cd "$PLATFORM" && exec node packages/cli/src/gp.ts "$@"; }
abs() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s' "$PWD/$1" ;; esac; }

# gp runs from the platform: make the paths given to --out and --script absolute first
args=()
absolute_args() {
  args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --out|--script)
        args+=("$1"); shift
        if [ $# -gt 0 ]; then args+=("$(abs "$1")"); shift; fi ;;
      *) args+=("$1"); shift ;;
    esac
  done
}

# Commands without a game
case "$cmd" in
  explain|catalog|docs|doctor|help|schema|init|new)
    absolute_args "$@"; gp "$cmd" ${args[@]+"${args[@]}"} ;;
  forecast)
    for a in "$@"; do
      case "$a" in --idea|--results) absolute_args "$@"; gp "$cmd" ${args[@]+"${args[@]}"} ;; esac
    done ;;
esac

# android check-manifest / admob provision: the subcommand comes before the game
sub=()
case "$cmd" in
  android|admob) if [ $# -gt 0 ]; then sub=("$1"); shift; fi ;;
esac

games=()
for f in "$HERE"/games/*/game.yaml; do [ -f "$f" ] && games+=("$(basename "$(dirname "$f")")"); done

# The game: the next argument when it names one (an id from games/, a folder or a game.yaml), else the only game
game=""
if [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; then
  if [ -f "$HERE/games/$1/game.yaml" ]; then game="$HERE/games/$1"; shift
  elif [ -f "$1/game.yaml" ] || { [ -f "$1" ] && [ "${1%.yaml}" != "$1" ]; }; then game="$(abs "$1")"; shift
  fi
fi
if [ -z "$game" ]; then
  if [ ${#games[@]} -eq 1 ]; then game="$HERE/games/${games[0]}"
  elif [ ${#games[@]} -eq 0 ]; then echo "No game in $HERE/games (games/<id>/game.yaml)"; exit 1
  else echo "Several games here: name one — scripts/gp.sh $cmd <game> …   (games: ${games[*]})"; exit 1
  fi
fi
absolute_args "$@"
gp "$cmd" ${sub[@]+"${sub[@]}"} "$game" ${args[@]+"${args[@]}"}
