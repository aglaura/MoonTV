#!/bin/bash
set -e

# =========================
# CONFIG — CHANGE THESE
# =========================
PWA_URL="https://essaouira.vercel.app"
MANIFEST_URL="${PWA_URL}/manifest.json"
APP_NAME="Essaouira TV"
PACKAGE_NAME="app.vercel.essaouira.tv"
OUTPUT_DIR="essaouira-twa-tv"
KEYSTORE="twa-release.keystore"
KEY_ALIAS="twa-key"
KEYSTORE_PASS="changeit"
KEY_PASS="changeit"

# =========================
# CHECK DEPENDENCIES
# =========================
command -v node >/dev/null || { echo "❌ Node.js required"; exit 1; }
command -v java >/dev/null || { echo "❌ Java required"; exit 1; }

if ! command -v bubblewrap >/dev/null; then
  echo "📦 Installing bubblewrap..."
  npm install -g @bubblewrap/cli
fi

# =========================
# CREATE PROJECT
# =========================
rm -rf "$OUTPUT_DIR"
mkdir "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

echo "🚀 Initializing TWA project..."
bubblewrap init \
  --manifest="$MANIFEST_URL" \
  --packageId="$PACKAGE_NAME" \
  --name="$APP_NAME" \
  --skipPwaValidation

# =========================
# ANDROID TV SUPPORT
# =========================
if [ -f "android/app/src/main/AndroidManifest.xml" ]; then
  APP_DIR="android/app"
elif [ -f "app/src/main/AndroidManifest.xml" ]; then
  APP_DIR="app"
else
  echo "❌ AndroidManifest.xml not found. Bubblewrap layout may have changed."
  exit 1
fi

MANIFEST_FILE="${APP_DIR}/src/main/AndroidManifest.xml"

echo "📺 Enabling Android TV support..."

sed -i '/<activity /a \
        android:screenOrientation="landscape"' "$MANIFEST_FILE"

sed -i '/<intent-filter>/a \
                <category android:name="android.intent.category.LEANBACK_LAUNCHER"/>' "$MANIFEST_FILE"

# =========================
# TV BANNER PLACEHOLDER
# =========================
BANNER_DIR="${APP_DIR}/src/main/res/drawable-xhdpi"
mkdir -p "$BANNER_DIR"

if [ ! -f "$BANNER_DIR/banner.png" ]; then
  echo "🖼 Creating placeholder TV banner (1280x720)"
  convert -size 1280x720 xc:black "$BANNER_DIR/banner.png" 2>/dev/null || true
fi

# =========================
# KEYSTORE
# =========================
if [ ! -f "$KEYSTORE" ]; then
  echo "🔐 Generating keystore..."
  keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -storepass "$KEYSTORE_PASS" \
    -alias "$KEY_ALIAS" \
    -keypass "$KEY_PASS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=$APP_NAME, OU=TV, O=Essaouira, L=World, S=World, C=US"
fi

# =========================
# BUILD APK
# =========================
echo "📦 Building release APK..."
bubblewrap build \
  --release \
  --keystore="$KEYSTORE" \
  --keystore-alias="$KEY_ALIAS" \
  --keystore-pass="$KEYSTORE_PASS" \
  --key-pass="$KEY_PASS"

# =========================
# DONE
# =========================
APK_PATH=$(find . -name "*release*.apk" | head -n 1)

echo ""
echo "✅ DONE!"
echo "📺 Android TV APK created:"
echo "👉 $APK_PATH"
echo ""
echo "You can now:"
echo "- Install on Android TV"
echo "- Upload to Vercel / server"
echo "- Share single installer link"
