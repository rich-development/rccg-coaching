#!/bin/sh
set -e
case "$CONVEX_DEPLOY_KEY" in
  "")
    echo "No CONVEX_DEPLOY_KEY set. Building the site only."
    npm run build
    ;;
  dev:*)
    echo "Pushing Convex functions to the dev deployment, then building."
    npx convex dev --once --tail-logs disable
    npm run build
    ;;
  *)
    echo "Deploying Convex functions, then building."
    npx convex deploy --cmd 'npm run build'
    ;;
esac
