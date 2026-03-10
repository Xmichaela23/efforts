#!/usr/bin/env bash
# sim-build.sh — build JS, sync to iOS, build simulator, install & launch
# Usage: bash scripts/sim-build.sh
set -e

PROJ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIM_ID="479EA5A2-8F01-462A-9756-F0B46416FC14"   # iPhone 16e
BUNDLE_ID="com.efforts.app"

echo "▶ 1/4  JS build"
cd "$PROJ_ROOT"
npm run build

echo "▶ 2/4  Capacitor sync"
npx cap sync ios

echo "▶ 3/4  Xcode simulator build"
xcodebuild \
  -project "$PROJ_ROOT/ios/App/App.xcodeproj" \
  -scheme App \
  -sdk iphonesimulator \
  -destination "id=$SIM_ID" \
  -configuration Debug \
  CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO \
  build 2>&1 | grep -E "error:|BUILD (SUCCEEDED|FAILED)" || true

echo "▶ 4/4  Install & launch on simulator"
xcrun simctl boot "$SIM_ID" 2>/dev/null || true
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphonesimulator -name "App.app" 2>/dev/null | head -1)
xcrun simctl install "$SIM_ID" "$APP_PATH"
xcrun simctl launch "$SIM_ID" "$BUNDLE_ID"
open -a Simulator

echo "✅  Done — app running on iPhone 16e simulator"
