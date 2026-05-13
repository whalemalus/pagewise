#!/bin/bash
# 智阅 PageWise — Chrome Web Store 打包脚本
# 用途：生成可提交到 Chrome Web Store 的 .zip 文件
#
# 用法:
#   bash scripts/package.sh          # 打包 Chrome 版本
#   bash scripts/package.sh --verify # 打包并验证
#   bash scripts/package.sh --check  # 仅检查体积，不打包

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

MODE="${1:-build}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; }

echo ""
echo "========================================="
echo "  智阅 PageWise — 打包工具"
echo "========================================="
echo ""

# ── 1. 读取版本号 ──────────────────────────────────────────────
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
if [ -z "$VERSION" ]; then
  fail "无法从 manifest.json 读取版本号"
  exit 1
fi
info "版本号: v${VERSION}"

# ── 2. 校验 manifest.json ──────────────────────────────────────
info "校验 manifest.json..."

# 检查必要字段
MISSING_FIELDS=()
grep -q '"manifest_version"' manifest.json || MISSING_FIELDS+=("manifest_version")
grep -q '"name"' manifest.json || MISSING_FIELDS+=("name")
grep -q '"version"' manifest.json || MISSING_FIELDS+=("version")
grep -q '"description"' manifest.json || MISSING_FIELDS+=("description")
grep -q '"permissions"' manifest.json || MISSING_FIELDS+=("permissions")
grep -q '"background"' manifest.json || MISSING_FIELDS+=("background")
grep -q '"icons"' manifest.json || MISSING_FIELDS+=("icons")

if [ ${#MISSING_FIELDS[@]} -gt 0 ]; then
  fail "manifest.json 缺少必要字段: ${MISSING_FIELDS[*]}"
  exit 1
fi
ok "manifest.json 字段完整"

# ── 3. 检查图标文件 ────────────────────────────────────────────
info "检查图标文件..."
for size in 16 48 128; do
  icon="icons/icon${size}.png"
  if [ ! -f "$icon" ]; then
    fail "缺少图标: $icon"
    exit 1
  fi
  icon_size=$(wc -c < "$icon")
  if [ "$icon_size" -lt 100 ]; then
    warn "图标 $icon 可能为空文件 (${icon_size} bytes)"
  fi
done
ok "图标文件完整 (16/48/128)"

# ── 4. 创建临时打包目录 ────────────────────────────────────────
DIST_DIR="$PROJECT_DIR/dist"
BUILD_DIR="$DIST_DIR/pagewise-chrome-store"
ZIP_NAME="pagewise-v${VERSION}-chrome-web-store.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

rm -rf "$DIST_DIR"
mkdir -p "$BUILD_DIR"

info "复制扩展文件..."

# 复制核心目录
cp -r icons "$BUILD_DIR/"
cp -r background "$BUILD_DIR/"
cp -r content "$BUILD_DIR/"
cp -r popup "$BUILD_DIR/"
cp -r sidebar "$BUILD_DIR/"
cp -r options "$BUILD_DIR/"
cp -r lib "$BUILD_DIR/"
cp -r skills "$BUILD_DIR/"
cp -r _locales "$BUILD_DIR/"

# 复制 manifest
cp manifest.json "$BUILD_DIR/"

# ── 5. 清理非必要文件 ─────────────────────────────────────────
info "清理非必要文件..."

# 移除开发/测试文件
rm -rf "$BUILD_DIR/tests" 2>/dev/null || true
rm -rf "$BUILD_DIR/docs" 2>/dev/null || true
rm -rf "$BUILD_DIR/scripts" 2>/dev/null || true
rm -rf "$BUILD_DIR/.git" 2>/dev/null || true

# 移除 OS 生成文件
find "$BUILD_DIR" -name ".DS_Store" -delete 2>/dev/null || true
find "$BUILD_DIR" -name "Thumbs.db" -delete 2>/dev/null || true
find "$BUILD_DIR" -name "*.bak" -delete 2>/dev/null || true
find "$BUILD_DIR" -name "*.tmp" -delete 2>/dev/null || true

# 移除开发配置文件
rm -f "$BUILD_DIR/package.json" 2>/dev/null || true
rm -f "$BUILD_DIR/CLAUDE.md" 2>/dev/null || true
rm -f "$BUILD_DIR/CHANGELOG.md" 2>/dev/null || true
rm -f "$BUILD_DIR/README.md" 2>/dev/null || true
rm -f "$BUILD_DIR/ROADMAP.md" 2>/dev/null || true
rm -f "$BUILD_DIR/PRIVACY.md" 2>/dev/null || true
rm -f "$BUILD_DIR/STORE-LISTING.md" 2>/dev/null || true
rm -f "$BUILD_DIR/manifest.firefox.json" 2>/dev/null || true
rm -f "$BUILD_DIR/manifest.edge.json" 2>/dev/null || true
rm -f "$BUILD_DIR/prompt-r43.txt" 2>/dev/null || true
rm -f "$BUILD_DIR/run-r43.sh" 2>/dev/null || true

# 移除非 Chrome 必要的 PDF worker 备份
rm -f "$BUILD_DIR/lib/pdf.worker.mjs" 2>/dev/null || true

ok "清理完成"

# ── 6. 统计文件信息 ────────────────────────────────────────────
info "统计打包文件..."

FILE_COUNT=$(find "$BUILD_DIR" -type f | wc -l)
DIR_COUNT=$(find "$BUILD_DIR" -type d | wc -l)
TOTAL_SIZE=$(du -sb "$BUILD_DIR" | cut -f1)

echo ""
echo "  ┌─────────────────────────────────────"
echo "  │ 文件数量: ${FILE_COUNT}"
echo "  │ 目录数量: ${DIR_COUNT}"
echo "  │ 原始大小: $(numfmt --to=iec $TOTAL_SIZE 2>/dev/null || echo "${TOTAL_SIZE} bytes")"
echo "  └─────────────────────────────────────"
echo ""

# ── 7. 打包 ZIP ────────────────────────────────────────────────
info "生成 ZIP 文件..."

if command -v zip &> /dev/null; then
  cd "$BUILD_DIR"
  zip -r -q "$ZIP_PATH" .
  cd "$PROJECT_DIR"
else
  fail "需要 zip 命令来打包"
  rm -rf "$BUILD_DIR"
  exit 1
fi

# ── 8. 计算文件哈希 ────────────────────────────────────────────
info "计算文件哈希..."

ZIP_SIZE=$(stat -c%s "$ZIP_PATH" 2>/dev/null || stat -f%z "$ZIP_PATH" 2>/dev/null || wc -c < "$ZIP_PATH")

if command -v sha256sum &> /dev/null; then
  SHA256=$(sha256sum "$ZIP_PATH" | cut -d' ' -f1)
  MD5=$(md5sum "$ZIP_PATH" | cut -d' ' -f1)
elif command -v shasum &> /dev/null; then
  SHA256=$(shasum -a 256 "$ZIP_PATH" | cut -d' ' -f1)
  MD5=$(md5 -q "$ZIP_PATH")
else
  SHA256="(sha256sum 不可用)"
  MD5="(md5sum 不可用)"
fi

# ── 9. 打包报告 ────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  打包报告 — 智阅 PageWise v${VERSION}"
echo "========================================="
echo ""
echo "📦 输出文件"
echo "  路径: $ZIP_PATH"
echo "  大小: $(numfmt --to=iec $ZIP_SIZE 2>/dev/null || echo "${ZIP_SIZE} bytes")"
echo ""
echo "🔐 文件哈希"
echo "  SHA-256: $SHA256"
echo "  MD5:     $MD5"
echo ""
echo "📊 体积检查"

# 体积阈值检查
MAX_SIZE=2097152  # 2MB
if [ "$ZIP_SIZE" -le "$MAX_SIZE" ]; then
  ok "打包体积: $(numfmt --to=iec $ZIP_SIZE 2>/dev/null || echo "${ZIP_SIZE} bytes") ≤ 2MB ✅"
else
  warn "打包体积: $(numfmt --to=iec $ZIP_SIZE 2>/dev/null || echo "${ZIP_SIZE} bytes") > 2MB ⚠️"
  warn "Chrome Web Store 限制 10MB，但建议保持 < 2MB"
fi

echo ""
echo "📁 包含内容"
echo "  ┌─────────────────────────────────────"
echo "  │ manifest.json"
echo "  │ background/   (Service Worker)"
echo "  │ content/      (Content Script)"
echo "  │ sidebar/      (Side Panel UI)"
echo "  │ popup/        (Popup UI)"
echo "  │ options/      (Settings Page)"
echo "  │ lib/          (核心库)"
echo "  │ skills/       (内置技能)"
echo "  │ icons/        (图标资源)"
echo "  │ _locales/     (国际化)"
echo "  └─────────────────────────────────────"
echo ""
echo "🚫 已排除"
echo "  tests/, docs/, scripts/, .git/"
echo "  *.md (README, CHANGELOG 等)"
echo "  manifest.firefox.json, manifest.edge.json"
echo "  开发配置文件"
echo ""

# ── 10. 安全检查 ───────────────────────────────────────────────
if [ "$MODE" = "--verify" ]; then
  info "执行安全验证..."

  # 检查是否有 eval
  EVAL_COUNT=$(grep -rl '\beval\s*(' "$BUILD_DIR" --include="*.js" --include="*.html" 2>/dev/null | grep -v "skill-validator" | wc -l)
  if [ "$EVAL_COUNT" -gt 0 ]; then
    fail "发现 $EVAL_COUNT 个文件包含 eval()"
  else
    ok "无 eval() 使用"
  fi

  # 检查是否有 inline script
  INLINE_COUNT=0
  for f in $(find "$BUILD_DIR" -name "*.html"); do
    if grep -q '<script' "$f" && ! grep -q 'src=' "$f"; then
      INLINE_COUNT=$((INLINE_COUNT + 1))
    fi
  done
  if [ "$INLINE_COUNT" -gt 0 ]; then
    fail "发现 $INLINE_COUNT 个 HTML 文件包含内联脚本"
  else
    ok "无内联脚本"
  fi

  # 检查非 HTTPS 外部资源
  HTTP_COUNT=$(grep -rn "http://" "$BUILD_DIR" --include="*.js" --include="*.html" | grep -v "localhost" | grep -v "127.0.0.1" | grep -v "xmlns" | grep -v "startsWith" | grep -v "@type" | wc -l)
  if [ "$HTTP_COUNT" -gt 0 ]; then
    warn "发现 $HTTP_COUNT 处非 HTTPS 引用（需人工确认）"
  else
    ok "无非 HTTPS 外部资源"
  fi

  echo ""
fi

# 清理临时目录
rm -rf "$BUILD_DIR"

ok "打包完成! 🎉"
echo ""
echo "安装测试: chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选择 dist/ 目录"
echo "提交商店: 打开 https://chrome.google.com/webstore/devconsole → 上传 $ZIP_NAME"
echo ""
