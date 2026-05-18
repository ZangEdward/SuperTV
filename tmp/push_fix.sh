#!/bin/bash
cd /workspaces/SuperTV
git add components/navigation/MobileTabContainer.tsx
git commit -m "fix: BlurView closing tag" --allow-empty
git push -v 2>&1