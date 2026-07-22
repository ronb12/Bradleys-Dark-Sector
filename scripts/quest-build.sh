#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -d "$ROOT/.tools/jdk/Contents/Home" ]]; then
  export JAVA_HOME="$ROOT/.tools/jdk/Contents/Home"
fi

if [[ -d "$ROOT/.tools/android-sdk" ]]; then
  export ANDROID_HOME="$ROOT/.tools/android-sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

cd "$ROOT/quest-launcher"
./gradlew :app:assembleDebug

echo "Quest APK: $ROOT/quest-launcher/app/build/outputs/apk/debug/app-debug.apk"
