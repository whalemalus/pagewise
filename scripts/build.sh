#!/bin/bash
# 智阅 PageWise - 打包脚本
# 用法: bash scripts/build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 读取版本号
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
if [ -z "$VERSION" ]; then
  echo "无法从 manifest.json 读取版本号"
  exit 1
fi

DIST_DIR="$PROJECT_DIR/dist"
ZIP_NAME="pagewise-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"
TEMP_DIR="$DIST_DIR/pagewise-build"

echo "智阅 PageWise v${VERSION} 打包中..."
echo ""

# 清理并创建输出目录
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 复制扩展文件到临时目录
mkdir -p "$TEMP_DIR"
cp manifest.json "$TEMP_DIR/"
cp -r icons "$TEMP_DIR/"
cp -r background "$TEMP_DIR/"
cp -r content "$TEMP_DIR/"
cp -r popup "$TEMP_DIR/"
cp -r sidebar "$TEMP_DIR/"
cp -r options "$TEMP_DIR/"
cp -r lib "$TEMP_DIR/"
cp -r skills "$TEMP_DIR/"
cp -r _locales "$TEMP_DIR/"

# 打包 zip (Windows 用 PowerShell，其他系统用 zip)
if command -v zip &> /dev/null; then
  cd "$TEMP_DIR"
  zip -r "$ZIP_PATH" . -x "*.DS_Store" -x "Thumbs.db"
  cd "$PROJECT_DIR"
elif command -v powershell.exe &> /dev/null; then
  # Windows PowerShell 打包
  WIN_TEMP_DIR=$(cygpath -w "$TEMP_DIR")
  WIN_ZIP_PATH=$(cygpath -w "$ZIP_PATH")
  powershell.exe -Command "Compress-Archive -Path '${WIN_TEMP_DIR}\\*' -DestinationPath '${WIN_ZIP_PATH}' -Force"
else
  echo "错误: 需要 zip 或 powershell 命令来打包"
  exit 1
fi

# 清理临时目录
rm -rf "$TEMP_DIR"

# 输出结果
FILE_SIZE=$(stat -c%s "$ZIP_PATH" 2>/dev/null || stat -f%z "$ZIP_PATH" 2>/dev/null || wc -c < "$ZIP_PATH")
echo ""
echo "打包完成!"
echo "  文件: $ZIP_PATH"
echo "  大小: ${FILE_SIZE} bytes"
echo ""
echo "用途:"
echo "  1. Chrome Web Store: 将 zip 上传到 Chrome Web Store 开发者后台"
echo "  2. 本地安装: 解压后在 chrome://extensions 加载已解压的扩展程序"
echo "  3. GitHub Release: gh release create v${VERSION} \"$ZIP_PATH\""
