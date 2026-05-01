#!/usr/bin/env bash
# spec-workflow.sh — 一键需求驱动开发流水线
#
# 用法:
#   ./scripts/spec-workflow.sh <功能描述>
#
# 流水线:
#   spec-generation → spec-executor → spec-validation → spec-testing
#         ↑                                            ↓ (<90%)
#         ←←←←←←←← 自动优化循环 (最多3轮) ←←←←←←←←←←
#
# 借鉴自 Claude Code Sub Agents 文章的四角色流水线设计

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
SPECS_DIR="${PROJECT_DIR}/docs/specs"
mkdir -p "$LOG_DIR" "$SPECS_DIR"

# ========== 颜色输出 ==========
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()      { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_stage()   { echo -e "${CYAN}[STAGE]${NC} $1"; }

# ========== 参数检查 ==========
if [ $# -eq 0 ]; then
    echo "用法: $0 <功能描述>"
    echo ""
    echo "示例:"
    echo "  $0 '实现页面高亮标注功能'"
    echo "  $0 '添加对话导出为 Markdown 功能'"
    echo "  $0 '优化知识库搜索性能'"
    exit 1
fi

FEATURE_DESC="$1"
FEATURE_NAME=$(echo "$FEATURE_DESC" | tr ' ' '_' | head -c 50)
SPEC_DIR="${SPECS_DIR}/${FEATURE_NAME}"

log_info "功能: ${FEATURE_DESC}"
log_info "规格目录: ${SPEC_DIR}"
log_info "质量阈值: ${QUALITY_THRESHOLD}% | 最大轮次: ${MAX_ROUNDS}"

# ========== Claude Code 执行器 ==========
run_claude() {
    local prompt="$1"
    local stage="$2"
    local log_file="${LOG_DIR}/spec-${TIMESTAMP}-${stage}.log"
    
    log_stage "执行: ${stage}"
    
    cd "$PROJECT_DIR"
    su - claude-user -c "cd ${PROJECT_DIR} && \
        ANTHROPIC_API_KEY='${API_KEY}' \
        ANTHROPIC_BASE_URL='${BASE_URL}' \
        claude -p '${prompt}' \
        --max-turns ${MAX_TURNS} \
        --dangerously-skip-permissions" 2>&1 | tee "$log_file"
    
    return ${PIPESTATUS[0]}
}

# ========== Stage 1: 规格生成 ==========
stage_spec_generation() {
    log_stage "📝 Stage 1: 规格生成 (spec-generation)"
    
    local prompt="你是一个规格生成专家。为以下功能生成完整的规格文档:

功能描述: ${FEATURE_DESC}

请创建以下三个文件:
1. docs/specs/${FEATURE_NAME}/requirements.md — 需求文档（EARS格式用户故事 + 验收标准）
2. docs/specs/${FEATURE_NAME}/design.md — 设计文档（架构、组件、数据模型、错误处理）
3. docs/specs/${FEATURE_NAME}/tasks.md — 任务清单（可执行的编码任务，checkbox格式）

约束:
- 每个需求必须有用户故事和验收标准
- 设计必须覆盖所有需求
- 任务必须是编码任务（写代码、写测试），不要用户测试或部署任务
- 创建目录: mkdir -p ${SPEC_DIR}

完成后列出创建的文件。"
    
    run_claude "$prompt" "spec-generation"
}

# ========== Stage 2: 代码实现 ==========
stage_spec_executor() {
    log_stage "⚙️ Stage 2: 代码实现 (spec-executor)"
    
    local prompt="你是一个代码实现专家。基于规格文档实现功能。

1. 读取以下规格文件:
   - ${SPEC_DIR}/requirements.md
   - ${SPEC_DIR}/design.md
   - ${SPEC_DIR}/tasks.md

2. 按照 tasks.md 中的任务清单逐个实现:
   - 每完成一个任务，更新 tasks.md 中的 checkbox
   - 遵循 design.md 中的架构设计
   - 满足 requirements.md 中的验收标准

3. 实现完成后:
   - 运行 node --test tests/test-*.js 确认所有测试通过
   - 更新 docs/IMPLEMENTATION.md 记录变更
   - git commit 并 push

约束: 遵循 CLAUDE.md 中的开发规范。"
    
    run_claude "$prompt" "spec-executor"
}

# ========== Stage 3: 质量验证 ==========
stage_spec_validation() {
    log_stage "🔍 Stage 3: 质量验证 (spec-validation)"
    
    # 运行测试
    log_info "运行测试..."
    cd "$PROJECT_DIR"
    local test_output
    test_output=$(node --test tests/test-*.js 2>&1)
    local total=$(echo "$test_output" | grep "^# tests" | awk '{print $3}')
    local pass=$(echo "$test_output" | grep "^# pass" | awk '{print $3}')
    local fail=$(echo "$test_output" | grep "^# fail" | awk '{print $3}')
    
    log_info "测试结果: ${pass}/${total} 通过, ${fail} 失败"
    
    # 计算评分
    local score=0
    if [ "${fail:-0}" -eq 0 ]; then
        score=$((score + 90))  # 测试全部通过 = 90分基础
    else
        local penalty=$((fail * 5))
        score=$((score + 90 - penalty))
    fi
    
    # 测试覆盖 (10分)
    if [ "${pass:-0}" -ge 1873 ]; then
        score=$((score + 10))
    elif [ "${pass:-0}" -ge 1800 ]; then
        score=$((score + 7))
    else
        score=$((score + 4))
    fi
    
    if [ $score -gt 100 ]; then score=100; fi
    if [ $score -lt 0 ]; then score=0; fi
    
    echo "${score}"
}

# ========== Stage 4: 测试生成 ==========
stage_spec_testing() {
    log_stage "🧪 Stage 4: 测试生成 (spec-testing)"
    
    local prompt="你是一个测试生成专家。为以下功能生成全面的测试:

功能: ${FEATURE_DESC}
规格目录: ${SPEC_DIR}

1. 读取 requirements.md 和 design.md
2. 为每个需求点编写测试用例
3. 使用 node:test 框架
4. 测试文件放在 tests/ 目录
5. 运行 node --test tests/test-*.js 验证全部通过

测试类型:
- 单元测试: 测试各个函数/方法
- 集成测试: 测试模块间交互
- 边界测试: 空输入、特殊字符、超大输入
- 错误处理: 异常情况的处理"
    
    run_claude "$prompt" "spec-testing"
}

# ========== 主流水线 ==========
round=1
final_score=0

while [ $round -le $MAX_ROUNDS ]; do
    echo ""
    echo "=========================================="
    log_info "========== 流水线第 ${round} 轮 =========="
    echo "=========================================="
    
    # Stage 1: 规格生成
    if ! stage_spec_generation; then
        log_error "规格生成失败"
        round=$((round + 1))
        continue
    fi
    
    # Stage 2: 代码实现
    if ! stage_spec_executor; then
        log_error "代码实现失败"
        round=$((round + 1))
        continue
    fi
    
    # Stage 3: 质量验证
    final_score=$(stage_spec_validation)
    log_info "质量评分: ${final_score}/100"
    
    # 质量门控
    if [ "$final_score" -ge "$QUALITY_THRESHOLD" ]; then
        log_ok "✅ 质量门控通过 (${final_score} >= ${QUALITY_THRESHOLD})"
        
        # Stage 4: 测试生成
        stage_spec_testing || log_warn "测试生成有警告，但质量已达标"
        
        # 写 VERIFICATION.md
        cat > "${PROJECT_DIR}/docs/VERIFICATION.md" << EOF
# VERIFICATION.md — Spec Workflow 审核

> **审核日期**: $(date +%Y-%m-%d)
> **功能**: ${FEATURE_DESC}
> **质量评分**: ${final_score}/100
> **门控结果**: ✅ 通过
> **返工轮次**: 第 ${round} 轮

## 测试结果
$(node --test tests/test-*.js 2>&1 | grep "^# (tests|pass|fail)")

---
*spec-workflow.sh 自动生成*
EOF
        
        echo ""
        echo "=========================================="
        log_ok "🎉 流水线完成! 质量评分: ${final_score}/100"
        log_ok "规格文档: ${SPEC_DIR}/"
        log_ok "验证报告: ${PROJECT_DIR}/docs/VERIFICATION.md"
        echo "=========================================="
        exit 0
    else
        log_warn "⚠️ 质量门控未通过 (${final_score} < ${QUALITY_THRESHOLD})"
        
        if [ $round -lt $MAX_ROUNDS ]; then
            log_info "准备第 $((round + 1)) 轮优化..."
            # 追加反馈到 requirements.md
            echo -e "\n\n## 返工反馈 (第 ${round} 轮)\n- 质量评分: ${final_score}/100\n- 测试失败数需修复\n- 需要优化代码质量和测试覆盖" >> "${SPEC_DIR}/requirements.md"
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
