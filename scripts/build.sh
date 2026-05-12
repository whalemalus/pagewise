#!/bin/bash
# 智阅 PageWise - 多浏览器打包脚本
# 用法:
#   bash scripts/build.sh              # 默认 Chrome
#   bash scripts/build.sh chrome       # Chrome
#   bash scripts/build.sh firefox      # Firefox
#   bash scripts/build.sh edge         # Edge
#   bash scripts/build.sh all          # 所有浏览器

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 浏览器参数
BROWSER="${1:-chrome}"
BROWSER=$(echo "$BROWSER" | tr '[:upper:]' '[:lower:]')

# 验证浏览器参数
case "$BROWSER" in
  chrome|firefox|edge|all) ;;
  *)
    echo "错误: 不支持的浏览器 '$BROWSER'"
    echo "用法: bash scripts/build.sh [chrome|firefox|edge|all]"
    exit 1
    ;;
esac

# 读取版本号（从主 manifest.json）
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
if [ -z "$VERSION" ]; then
  echo "无法从 manifest.json 读取版本号"
  exit 1
fi

DIST_DIR="$PROJECT_DIR/dist"

# 打包单个浏览器
build_browser() {
  local target="$1"
  local manifest_src=""
  local zip_name=""
  local temp_dir="$DIST_DIR/pagewise-${target}-build"
  local zip_path=""

  case "$target" in
    chrome)
      manifest_src="manifest.json"
      zip_name="pagewise-v${VERSION}-chrome.zip"
      ;;
    firefox)
      manifest_src="manifest.firefox.json"
      zip_name="pagewise-v${VERSION}-firefox.zip"
      ;;
    edge)
      manifest_src="manifest.edge.json"
      zip_name="pagewise-v${VERSION}-edge.zip"
      ;;
  esac

  zip_path="$DIST_DIR/$zip_name"

  echo "========================================="
  echo "打包 $target 版本 (v${VERSION})..."
  echo "========================================="
  echo ""

  # 检查 manifest 文件是否存在
  if [ ! -f "$manifest_src" ]; then
    echo "错误: $manifest_src 不存在"
    return 1
  fi

  # 清理并创建临时目录
  rm -rf "$temp_dir"
  mkdir -p "$temp_dir"

  # 复制 manifest
  cp "$manifest_src" "$temp_dir/manifest.json"

  # 复制扩展文件
  cp -r icons "$temp_dir/"
  cp -r background "$temp_dir/"
  cp -r content "$temp_dir/"
  cp -r popup "$temp_dir/"
  cp -r sidebar "$temp_dir/"
  cp -r options "$temp_dir/"
  cp -r lib "$temp_dir/"
  cp -r skills "$temp_dir/"
  cp -r _locales "$temp_dir/"

  # Firefox 特殊处理：移除不兼容的文件
  if [ "$target" = "firefox" ]; then
    # 移除 Firefox 不支持的 .mjs 模块（如果 service worker 使用 module type）
    # Firefox MV3 background 使用 scripts 数组而非 service_worker
    echo "  [Firefox] 清理不兼容的文件..."
  fi

  # 打包 zip
  if command -v zip &> /dev/null; then
    cd "$temp_dir"
    zip -r "$zip_path" . -x "*.DS_Store" -x "Thumbs.db"
    cd "$PROJECT_DIR"
  elif command -v powershell.exe &> /dev/null; then
    WIN_TEMP_DIR=$(cygpath -w "$temp_dir")
    WIN_ZIP_PATH=$(cygpath -w "$zip_path")
    powershell.exe -Command "Compress-Archive -Path '${WIN_TEMP_DIR}\\*' -DestinationPath '${WIN_ZIP_PATH}' -Force"
  else
    echo "错误: 需要 zip 或 powershell 命令来打包"
    rm -rf "$temp_dir"
    return 1
  fi

  # 清理临时目录
  rm -rf "$temp_dir"

  # 输出结果
  FILE_SIZE=$(stat -c%s "$zip_path" 2>/dev/null || stat -f%z "$zip_path" 2>/dev/null || wc -c < "$zip_path")
  echo "  文件: $zip_path"
  echo "  大小: ${FILE_SIZE} bytes"
  echo ""
}

# 执行打包
if [ "$BROWSER" = "all" ]; then
  rm -rf "$DIST_DIR"
  mkdir -p "$DIST_DIR"
  build_browser "chrome"
  build_browser "firefox"
  build_browser "edge"
  echo "========================================="
  echo "所有浏览器打包完成!"
  echo "========================================="
  echo ""
  echo "输出文件:"
  ls -lh "$DIST_DIR"/*.zip
else
  rm -rf "$DIST_DIR"
  mkdir -p "$DIST_DIR"
  build_browser "$BROWSER"
fi

echo ""
echo "安装说明:"
echo "  Chrome:  chrome://extensions → 开发者模式 → 加载已解压的扩展程序"
echo "  Firefox: about:debugging → 此 Firefox → 临时加载附加组件"
echo "  Edge:    edge://extensions → 开发者模式 → 加载解压缩的扩展"
