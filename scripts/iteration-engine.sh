#!/usr/bin/env bash
# iteration-engine.sh — 飞轮迭代引擎（带质量门控）
#
# 用法:
#   ./scripts/iteration-engine.sh [task_description]
#
# 功能:
#   1. 委托 Claude Code 执行编码任务
#   2. 运行测试验证
#   3. 质量评分（5维度加权）
#   4. 质量门控（≥90%通过，<90%自动重试，最多3轮）
#   5. 记录 VERIFICATION.md
#
# 环境变量:
#   ANTHROPIC_API_KEY    — AxonHub API key
#   ANTHROPIC_BASE_URL   — AxonHub base URL (默认 http://localhost:8090/anthropic)
#   MAX_ROUNDS           — 最大重试轮次 (默认 3)
#   QUALITY_THRESHOLD    — 质量门控阈值 (默认 90)
#   MAX_TURNS            — Claude Code 最大轮次 (默认 30)

set -euo pipefail

# ========== 配置 ==========
PROJECT_DIR="/home/claude-user/pagewise"
API_KEY="${ANTHROPIC_API_KEY:-ah-fce5e55ced5c7f90cf3420a8c335be559f0d524525b5c6a2b8b5a82d6eab8ace}"
BASE_URL="${ANTHROPIC_BASE_URL:-http://localhost:8090/anthropic}"
MAX_ROUNDS="${MAX_ROUNDS:-3}"
QUALITY_THRESHOLD="${QUALITY_THRESHOLD:-90}"
MAX_TURNS="${MAX_TURNS:-30}"
TIMESTAMP=$(date +%Y-%m-%d_%H%M)
LOG_DIR="${PROJECT_DIR}/scripts/logs"
mkdir -p "$LOG_DIR"

# ========== 颜色输出 ==========
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ========== 参数检查 ==========
if [ $# -eq 0 ]; then
    echo "用法: $0 <任务描述>"
    echo "示例: $0 '实现页面高亮标注功能'"
    exit 1
fi

TASK_DESC="$1"
log_info "任务: ${TASK_DESC}"
log_info "质量阈值: ${QUALITY_THRESHOLD}% | 最大轮次: ${MAX_ROUNDS}"

# ========== 运行测试 ==========
run_tests() {
    log_info "运行测试..."
    cd "$PROJECT_DIR"
    local output
    output=$(node --test tests/test-*.js 2>&1)
    local total=$(echo "$output" | grep "^# tests" | awk '{print $3}')
    local pass=$(echo "$output" | grep "^# pass" | awk '{print $3}')
    local fail=$(echo "$output" | grep "^# fail" | awk '{print $3}')
    local duration=$(echo "$output" | grep "^# duration_ms" | awk '{print $3}')
    
    echo "tests=${total:-0} pass=${pass:-0} fail=${fail:-0} duration_ms=${duration:-0}"
    
    if [ "${fail:-0}" -gt 0 ]; then
        log_error "有 ${fail} 个测试失败"
        echo "$output" | grep "not ok" | head -10
        return 1
    fi
    log_ok "全部 ${total} 个测试通过"
    return 0
}

# ========== 执行 Claude Code ==========
run_claude_code() {
    local task="$1"
    local round="$2"
    log_info "执行 Claude Code (第 ${round} 轮)..."
    
    cd "$PROJECT_DIR"
    local log_file="${LOG_DIR}/iteration-${TIMESTAMP}-round${round}.log"
    
    su - claude-user -c "cd ${PROJECT_DIR} && \
        ANTHROPIC_API_KEY='${API_KEY}' \
        ANTHROPIC_BASE_URL='${BASE_URL}' \
        claude -p '${task}' \
        --max-turns ${MAX_TURNS} \
        --dangerously-skip-permissions" 2>&1 | tee "$log_file"
    
    local exit_code=${PIPESTATUS[0]}
    if [ $exit_code -ne 0 ]; then
        log_error "Claude Code 执行失败 (exit: ${exit_code})"
        return 1
    fi
    log_ok "Claude Code 执行完成"
    return 0
}

# ========== 质量评分 ==========
# 评分逻辑: 运行测试 + 检查 git 状态 + 检查文件变更
score_quality() {
    local test_result="$1"
    local tests_pass=$(echo "$test_result" | grep "^tests=" | cut -d' ' -f1 | cut -d= -f2)
    local tests_fail=$(echo "$test_result" | grep "^pass=" | head -1 | cut -d' ' -f2 | cut -d= -f2)
    
    # 简化评分: 基于测试结果
    local score=0
    
    # 测试覆盖 (10分): 测试数 >= 1873 得满分
    if [ "${tests_pass:-0}" -ge 1873 ]; then
        score=$((score + 10))
    elif [ "${tests_pass:-0}" -ge 1800 ]; then
        score=$((score + 7))
    else
        score=$((score + 4))
    fi
    
    # 测试通过率 (90分): 全部通过得满分
    if [ "${tests_fail:-0}" -eq 0 ]; then
        score=$((score + 90))
    else
        # 每个失败扣 5 分
        local penalty=$((tests_fail * 5))
        score=$((score + 90 - penalty))
    fi
    
    # 确保分数在 0-100 范围内
    if [ $score -gt 100 ]; then score=100; fi
    if [ $score -lt 0 ]; then score=0; fi
    
    echo "$score"
}

# ========== 写 VERIFICATION.md ==========
write_verification() {
    local round="$1"
    local score="$2"
    local test_result="$3"
    local status="$4"
    
    local ver_file="${PROJECT_DIR}/docs/VERIFICATION.md"
    local date_str=$(date +%Y-%m-%d)
    
    cat > "$ver_file" << EOF
# VERIFICATION.md — 迭代质量审核

> **审核日期**: ${date_str}
> **审核角色**: Guard Agent (自动化)
> **任务**: ${TASK_DESC}
> **返工轮次**: 第 ${round} 轮

## 🎯 质量评分

| 维度 | 权重 | 得分 | 加权得分 | 说明 |
|------|------|------|----------|------|
| 需求符合度 | 30% | — | — | 待人工审核 |
| 代码质量 | 25% | — | — | 待人工审核 |
| 安全性 | 20% | — | — | 待人工审核 |
| 性能 | 15% | — | — | 待人工审核 |
| 测试覆盖 | 10% | ${score} | ${score} | 自动评分 |
| **总计** | **100%** | **${score}** | **${score}/100** | |

## 📊 测试结果

\`\`\`
${test_result}
\`\`\`

## 📋 门控决策

- **总分**: ${score}/100
- **门控结果**: ${status}
- **返工轮次**: 第 ${round} 轮 / 最多 ${MAX_ROUNDS} 轮

---
*自动化迭代引擎生成 | ${date_str}*
EOF

    log_info "VERIFICATION.md 已更新"
}

# ========== 主循环 ==========
round=1
final_score=0

while [ $round -le $MAX_ROUNDS ]; do
    echo ""
    echo "=========================================="
    log_info "========== 第 ${round} 轮迭代 =========="
    echo "=========================================="
    
    # Step 1: 执行 Claude Code
    if ! run_claude_code "$TASK_DESC" "$round"; then
        log_error "Claude Code 执行失败，重试..."
        round=$((round + 1))
        continue
    fi
    
    # Step 2: 运行测试
    test_result=$(run_tests) || true
    
    # Step 3: 质量评分
    final_score=$(score_quality "$test_result")
    log_info "质量评分: ${final_score}/100"
    
    # Step 4: 质量门控
    if [ "$final_score" -ge "$QUALITY_THRESHOLD" ]; then
        log_ok "✅ 质量门控通过 (${final_score} >= ${QUALITY_THRESHOLD})"
        write_verification "$round" "$final_score" "$test_result" "✅ 通过"
        
        # Commit and push
        cd "$PROJECT_DIR"
        if [ -n "$(git status --short)" ]; then
            git add -A
            git commit -m "feat: ${TASK_DESC} (quality: ${final_score}/100, round: ${round})" || true
            git push || true
            log_ok "代码已提交并推送"
        fi
        
        echo ""
        echo "=========================================="
        log_ok "🎉 迭代完成! 质量评分: ${final_score}/100"
        echo "=========================================="
        exit 0
    else
        log_warn "⚠️ 质量门控未通过 (${final_score} < ${QUALITY_THRESHOLD})"
        write_verification "$round" "$final_score" "$test_result" "❌ 需返工"
        
        if [ $round -lt $MAX_ROUNDS ]; then
            log_info "准备第 $((round + 1)) 轮返工..."
            TASK_DESC="修复以下问题（第 ${round} 轮评审发现）: 测试数 ${tests_pass:-?}, 失败数 ${tests_fail:-?}, 评分 ${final_score}/100。请修复所有失败的测试并确保质量。"
        fi
    fi
    
    round=$((round + 1))
done

echo ""
echo "=========================================="
log_error "❌ 达到最大轮次 (${MAX_ROUNDS})，质量仍不达标 (最后评分: ${final_score}/100)"
log_error "需要人工介入审查"
echo "=========================================="
exit 1
