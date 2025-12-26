#!/usr/bin/env bash
set -e

if [ $# -ne 1 ]; then
  echo "Usage: $0 [personal|work]"
  exit 1
fi

PROFILE="$1"

# extract repo name
ORIGIN_URL=$(git remote get-url origin)
REPO_NAME=$(basename -s .git "$ORIGIN_URL")

case "$PROFILE" in
  personal)
    echo "[INFO] Switching to PERSONAL identity (HTTPS + PAT)"

    git config user.name  "aglaura"
    git config user.email "aglaura@msn.com"

    # GPG signing ON
    git config user.signingkey "659E3C74C7C8983C"
    git config commit.gpgsign true
    git config tag.gpgsign true

    # PERSONAL MUST use HTTPS remote
    git remote set-url origin "https://github.com/aglaura/${REPO_NAME}.git"
    ;;

  work)
    echo "[INFO] Switching to WORK identity (SSH)"

    git config user.name  "meritechaaron"
    git config user.email "aaron.chuang@meritech.co.kr"

    # no GPG signing for work
    git config commit.gpgsign false
    git config tag.gpgsign false
    git config --unset user.signingkey 2>/dev/null || true

    # use SSH remote for work
    git remote set-url origin "git@github-work:meritechaaron/${REPO_NAME}.git"
    ;;

  *)
    echo "Unknown profile: $PROFILE"
    exit 1
    ;;
esac

echo
echo "✔ Active profile: $PROFILE"
echo "Remote: $(git remote get-url origin)"
