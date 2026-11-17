#!/usr/bin/env bash
# Connect to the TV over network debugging and install the debug APK.
# Usage: scripts/install.sh <tv-ip:port> [app-url]
#   With a app-url, rebuilds the APK first with -PfamilyUrl=<url>.
set -euo pipefail

target="${1:?usage: scripts/install.sh <tv-ip:port> [app-url]}"
url="${2:-}"
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
adb="$ANDROID_HOME/platform-tools/adb"
apk=app/build/outputs/apk/debug/app-debug.apk

if [[ -n "$url" ]]; then
  ./gradlew assembleDebug -PfamilyUrl="$url"
elif [[ ! -f "$apk" ]]; then
  ./gradlew assembleDebug
fi

"$adb" connect "$target"
"$adb" -s "$target" install -r "$apk"
echo "Installed. Launch with: $adb -s $target shell am start -n com.jamesstewart.family/.Home"
