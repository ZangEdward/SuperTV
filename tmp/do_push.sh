#!/bin/bash
cd /workspaces/SuperTV
git config user.email "ci@supertv.com"
git config user.name "CI Bot"
git add components/navigation/MobileTabContainer.tsx
git commit -m "fix: BlurView closing tag" --allow-empty
git push origin master 2>&1
EXIT_CODE=$?
echo "EXIT_CODE=$EXIT_CODE"