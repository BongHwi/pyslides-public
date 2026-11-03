#!/usr/bin/env bash
# Install this repository's agent skill as <skills dir>/pyslides/SKILL.md (default skills dir: ~/.claude/skills).
# The copy is filled in: __PYSLIDES_HOME__ becomes this clone's absolute path and __PYSLIDES_REPO__ becomes the URL of
# its `origin` remote (empty when there is no origin, so the skill never tries to clone). Credentials in the URL are dropped.
# An existing, different SKILL.md is backed up as SKILL.md.bak-<time> before it is replaced.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
home="$(cd "$here/.." && pwd)"
target_dir="${SKILLS_DIR:-${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}}/pyslides"
target="$target_dir/SKILL.md"
repo="$(git -C "$home" remote get-url origin 2>/dev/null || true)"
repo="$(printf '%s' "$repo" | sed -E 's#^([A-Za-z][A-Za-z0-9+.-]*://)[^/@]*@#\1#')"   # drop credentials from the URL
mkdir -p "$target_dir"
new="$(mktemp "$target_dir/.SKILL.md.XXXXXX")"
trap 'rm -f "$new"' EXIT
python3 - "$here/SKILL.md" "$home" "$repo" > "$new" <<'PY'
import re, sys
src, home, repo = sys.argv[1:4]
repo = repo.strip()
text = open(src, encoding="utf-8").read()
sys.stdout.write(text.replace("__PYSLIDES_HOME__", home).replace("__PYSLIDES_REPO__", repo))
PY
if [ -e "$target" ] && ! cmp -s "$new" "$target"; then
  backup="$target.bak-$(date +%Y%m%d-%H%M%S)"
  n=0
  while [ -e "$backup" ]; do n=$((n + 1)); backup="$target.bak-$(date +%Y%m%d-%H%M%S)-$n"; done
  cp -p "$target" "$backup"
  echo "Backed up the existing skill to $backup"
fi
chmod 644 "$new"
mv "$new" "$target"
trap - EXIT
echo "Installed $target (clone: $home, origin: ${repo:-none})"
