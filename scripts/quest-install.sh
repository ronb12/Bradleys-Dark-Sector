#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK="$ROOT/quest-launcher/app/build/outputs/apk/debug/app-debug.apk"

if [[ ! -f "$APK" ]]; then
  "$ROOT/scripts/quest-build.sh"
fi

if [[ -x "$ROOT/.tools/android-sdk/platform-tools/adb" ]]; then
  ADB="$ROOT/.tools/android-sdk/platform-tools/adb"
elif command -v adb >/dev/null 2>&1; then
  ADB="$(command -v adb)"
else
  echo "adb is unavailable. Install Android platform-tools first." >&2
  exit 1
fi

if ! "$ADB" get-state >/dev/null 2>&1; then
  echo "No authorized Quest found. Connect it by USB, enable Developer Mode, and approve USB debugging." >&2
  "$ADB" devices
  exit 1
fi

"$ADB" install -r "$APK"
echo "Installed Bradley's Dark Sector VR. Open it from Library > Unknown Sources."
