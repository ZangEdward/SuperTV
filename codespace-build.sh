#!/bin/bash

# SuperTV Codespace Build & OTA Script
# This script mirrors the GitHub Actions workflow logic for local execution in Codespaces.

set -e

# --- Configuration & Secrets Check ---
# Ensure these environment variables are set in your Codespace secrets:
# SIGNING_KEY (Base64), KEY_ALIAS, KEY_PASSWORD, PAT (GitHub Personal Access Token)

if [[ -z "$SIGNING_KEY" || -z "$KEY_ALIAS" || -z "$KEY_PASSWORD" || -z "$PAT" ]]; then
  echo "Error: Missing required environment variables (SIGNING_KEY, KEY_ALIAS, KEY_PASSWORD, PAT)."
  echo "Please configure them in GitHub Codespaces Secrets."
  exit 1
fi

JOB_TYPE=${1:-"ota"} # Default to ota if no argument provided
VERSION=$(node -p "require('./package.json').version")
echo "Starting build for SuperTV v$VERSION (Mode: $JOB_TYPE)"

# --- 1. Environment Setup ---
echo "Installing dependencies..."
yarn install --network-timeout 100000

# --- 2. Expo Prebuild ---
echo "Running Expo Prebuild..."
npx expo prebuild --platform android --no-install

# --- 3. Signing Configuration ---
echo "Configuring Android signing..."
echo "$SIGNING_KEY" | base64 --decode > android/app/release-key.jks

# Inject signing info into gradle.properties
cat >> android/gradle.properties << EOF
MYAPP_UPLOAD_STORE_FILE=release-key.jks
MYAPP_UPLOAD_KEY_ALIAS=$KEY_ALIAS
MYAPP_UPLOAD_STORE_PASSWORD=$KEY_PASSWORD
MYAPP_UPLOAD_KEY_PASSWORD=$KEY_PASSWORD
EOF

# --- 4. Build APK ---
echo "Starting Gradle build..."
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon
cd ..

# --- 5. Prepare Output ---
mkdir -p output
cp android/app/build/outputs/apk/release/app-release.apk output/SuperTV-$VERSION.apk
echo "Build successful! APK: output/SuperTV-$VERSION.apk"

# --- 6. OTA Publishing (Optional) ---
if [[ "$JOB_TYPE" == "ota" ]]; then
  echo "Proceeding with OTA release..."

  # Clone log repository
  rm -rf sync-repo
  git clone https://ZangEdward:$PAT@github.com/ZangEdward/internal-cache-sync-daemon-log.git sync-repo

  # Update metadata
  mkdir -p sync-repo/log/vision
  cp package.json sync-repo/log/vision/package.json
  APK_SIZE=$(stat -c%s "output/SuperTV-$VERSION.apk")
  echo "{ \"apksize\": ${APK_SIZE} }" > sync-repo/log/vision/apksize.json

  # Generate alien log
  TIMESTAMP=$(date +%s)
  LOGFILE="${TIMESTAMP}.log"
  HASH_NAME="ID-$(openssl rand -hex 16)"
  RAW_RANDOM=$(cat /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 1000)
  FORMATTED_RANDOM=$(echo "$RAW_RANDOM" | fold -w 100)

  {
    echo "timestamp: ${TIMESTAMP}"
    echo "sync_time: \"$(date '+%Y-%m-%d %H:%M:%S')\""
    echo "version: \"$VERSION\""
    echo ""
    echo "meta:"
    echo "  id: \"$HASH_NAME\""
    echo "  encoding: \"ascii-safe\""
    echo "  integrity: \"$(openssl rand -hex 8)\""
    echo ""
    echo "data_block:"
    echo "  sequence: \"$(openssl rand -hex 6)\""
    echo "  status: \"ok\""
    echo "  channel: \"release\""
    echo "  index: \"0.$((RANDOM))\""
    echo ""
    echo "stream: |"
    echo "$FORMATTED_RANDOM" | sed 's/^/  /'
    echo ""
    echo "footer:"
    echo "  note: \"generated-by-codespace-script\""
    echo "  checksum: \"$(openssl rand -hex 8)\""
  } > sync-repo/${LOGFILE}

  # Commit and push
  cd sync-repo
  git config user.name "github-actions"
  git config user.email "github-actions@github.com"
  git add .
  git commit -m "Update v$VERSION (Codespace build)" || true
  git push origin main
  cd ..

  echo "OTA Release finished successfully."
fi

echo "All tasks completed."
