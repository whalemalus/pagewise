# Claude Code 永不停歇：如何让 AI Agent 7x24 自动迭代开发项目

> **摘要**：本文分享了一套完整的方案，让 Claude Code 按照飞轮迭代流程 7x24 小时自动开发项目。从架构设计、Three-Layer Agent、Four-Document System 到 systemd 服务化部署，完整记录了让 AI Agent "永不停歇"的技术细节和实战经验。

> **关键词**：`Claude Code` `自动化开发` `飞轮迭代` `AI Agent` `持续集成`

---

## 楔子

凌晨 5 点，我躺在床上，手机收到一条消息：

```
[05:14:44] 迭代完成，退出码: 0
[05:14:44] Git 提交: feat: 知识库性能优化（索引、分页） - 飞轮迭代 R4
[05:14:44] 报告已保存: 2026-04-30-R4.md
```

打开 GitHub，果然——Claude Code 在我睡觉的时候，自动完成了第 4 轮迭代，+1055 行代码，知识库性能优化已实现。

这就是我想要的效果：**让 AI Agent 像一个永不疲倦的实习生，7x24 小时不停地写代码、跑测试、提交、记录。**

---

## 引言

这篇文章要做的事很简单：**让 Claude Code 每天自动迭代你的项目，永不停歇。**

完成后，你的 AI Agent 会：
- 每天自动执行 8-12 轮飞轮迭代
- 每轮完整执行：需求分析 → 设计 → 编码 → 测试 → 评审 → 文档
- 自动生成迭代报告，记录所有变更
- 遇到问题自动重试，失败后自动回滚

技术栈：Claude Code CLI、systemd 服务、Python 脚本、AxonHub API 网关。

---

## 1. 全景地图：系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                  systemd 服务管理                             │
│  systemctl start pagewise-iteration.service                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              持续迭代引擎 (pagewise-continuous-iteration.sh) │
│  7x24 循环，每轮完成后立即开始下一轮                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              飞轮迭代引擎 (pagewise-iteration-engine.py)     │
│  严格遵循 flywheel-iteration 技能文档                        │
│                                                             │
│  Phase 1: 需求分析 (Plan Agent)                             │
│  Phase 2: 设计 (Plan Agent)                                 │
│  Phase 3: 实现 (Sub Agent — Claude Code)                    │
│  Phase 4: 验证 (Guard Agent)                                │
│  Phase 5: 回顾 (Plan Agent)                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Claude Code CLI                             │
│  su - claude-user -c 'claude -p ...'                        │
│                                                             │
│  - 读取 REQUIREMENTS-ITER{N}.md 理解需求                    │
│  - 读取 DESIGN-ITER{N}.md 理解设计                          │
│  - 编写代码 + 测试                                          │
│  - 更新文档                                                 │
│  - Git commit + push                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            AxonHub API 网关 (localhost:8090)                 │
│  转发请求到 Anthropic API                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心概念

### 2.1 Three-Layer Agent Architecture

飞轮迭代的核心是三层 Agent 架构：

| 层级 | 角色 | 职责 | 谁执行 |
|------|------|------|--------|
| **Guard Agent** | 审核 & 监督 | 质量审查、Bug 检测、根因分析 | Hermes (脚本) |
| **Plan Agent** | 规划 & 编排 | 需求、设计、任务分解、Prompt 编写 | Claude Code |
| **Sub Agent** | 执行 | 编码、测试、文档更新、Git 提交 | Claude Code |

**关键规则**：Plan Agent 永远不写代码。即使是简单的修改，也必须委托给 Sub Agent 执行。这样可以确保：
1. 每次变更都有完整的审查流程
2. 文档和代码始终保持同步
3. 测试覆盖率达到 100%

### 2.2 Four-Document System

每轮迭代产生 4 个结构化文档，形成完整的可追溯链：

| 文档 | 回答的问题 | 谁写 | 谁读 |
|------|----------|------|------|
| `REQUIREMENTS-ITER{N}.md` | **做什么** | Plan Agent | Guard + Sub |
| `DESIGN-ITER{N}.md` | **怎么做** | Plan Agent | Guard + Sub |
| `IMPLEMENTATION.md` | **做了什么** | Sub Agent | Guard + Plan |
| `VERIFICATION-ITER{N}.md` | **做得怎样** | Guard Agent | Plan |

每个文档都可以独立阅读，但组合在一起就形成了从需求 → 设计 → 实现 → 验证的完整追溯链。

### 2.3 Pre-Reading Pattern

Claude Code 的 `Read` 工具是只读的，而且会计入 max-turns。读取一个 6000+ 行的文件会消耗大部分轮次预算。

**解决方案**：Hermes 先用 `read_file`（免费、快速）读取相关代码，然后嵌入到 Claude Code 的 prompt 中。Claude Code 从一开始就拥有完整上下文，把轮次花在实际工作上。

```python
def pre_reading_pattern(task):
    """Pre-Reading Pattern: Hermes 先读代码嵌入提示词"""
    code_context = ""
    for file_path in files_to_read:
        content = read_file(file_path)
        if content:
            lines = content.split('\n')[:500]  # 只读取前 500 行
            code_context += f"\n\n--- {file_path} ---\n" + '\n'.join(lines)
    return code_context
```

---

## 3. 实战指南

### 3.1 创建迭代引擎脚本

```python
#!/usr/bin/env python3
"""
PageWise 飞轮迭代引擎
严格遵循 flywheel-iteration 技能文档
"""

def run_claude_code(prompt, max_turns=25):
    """调用 Claude Code CLI 执行任务"""
    # 将 prompt 写入临时文件，避免 shell 转义问题
    prompt_file = "/tmp/pagewise-prompt.txt"
    write_file(prompt_file, prompt)
    
    # 使用 su - claude-user 执行 Claude Code
    cmd = f"""
    su - claude-user -c '
        export ANTHROPIC_API_KEY={api_key}
        export ANTHROPIC_BASE_URL=http://localhost:8090/anthropic
        cd {PROJECT_DIR} && \
        cat {prompt_file} | claude -p \
        --max-turns {max_turns} \
        --dangerously-skip-permissions \
        --bare --effort low
    '
    """
    result = run_command(cmd)
    return result

def run_iteration(iteration):
    """执行一轮飞轮迭代"""
    # Phase 1: 需求分析
    results["requirements"] = phase_1_requirements(task, iteration)
    
    # Phase 2: 设计
    results["design"] = phase_2_design(task, iteration)
    
    # Phase 3: 实现
    results["implementation"] = phase_3_implementation(task, iteration)
    
    # Phase 4: 验证
    results["verification"] = phase_4_verification(task, iteration)
    
    # Phase 5: 回顾
    results["retrospective"] = phase_5_retrospective(task, iteration)
```

### 3.2 创建持续运行脚本

```bash
#!/bin/bash
# PageWise 持续迭代引擎
# 7x24 运行，每轮完成后立即开始下一轮

while true; do
    echo "$(date): 开始新一轮迭代..."
    
    # 运行迭代引擎
    python3 /root/scripts/pagewise-iteration-engine.py
    
    # 短暂休息后开始下一轮
    echo "$(date): 休息 30 秒后开始下一轮..."
    sleep 30
done
```

### 3.3 创建 systemd 服务

```ini
[Unit]
Description=PageWise 持续迭代引擎
After=network.target

[Service]
Type=simple
User=root
ExecStart=/root/scripts/pagewise-continuous-iteration.sh
Restart=always
RestartSec=10
StandardOutput=append:/var/log/pagewise-iteration.log
StandardError=append:/var/log/pagewise-iteration.log

[Install]
WantedBy=multi-user.target
```

```bash
# 启动服务
systemctl daemon-reload
systemctl enable pagewise-iteration.service
systemctl start pagewise-iteration.service

# 查看状态
systemctl status pagewise-iteration.service

# 查看日志
tail -f /var/log/pagewise-iteration.log
```

### 3.4 TODO.md 驱动迭代

TODO.md 是飞轮的引擎。没有它，Claude Code 不知道下一步做什么。

```markdown
# TODO

## 本次迭代（v2.1）
- [ ] 知识库性能优化（索引、分页）
- [ ] AI 响应缓存（避免重复请求）
- [ ] 语义搜索 (Embedding)
- [ ] PDF/文档支持

## ✅ 已完成
### v2.0.0
- [x] MessageRenderer 模块拆分
- [x] KnowledgePanel 模块拆分
```

---

## 4. 踩坑记录

### 坑 1：Claude Code 不允许 root 使用 --dangerously-skip-permissions

```bash
# 错误信息
--dangerously-skip-permissions cannot be used with root/sudo privileges

# 解决方案：创建专用用户
useradd -m -s /bin/bash claude-user
su - claude-user -c 'claude -p ...'
```

### 坑 2：Shell 转义问题导致 prompt 丢失

```bash
# 错误做法：直接在命令行传 prompt
claude -p "实现功能..."  # 特殊字符被 shell 解释

# 正确做法：写到文件，通过 cat 管道传入
echo "prompt..." > /tmp/prompt.txt
cat /tmp/prompt.txt | claude -p
```

### 坑 3：文件权限问题导致 Claude Code 无法写入

```bash
# 问题：Hermes 以 root 创建文件，Claude Code 无法写入
# 解决：每次委托 Claude Code 前修复权限
chown -R claude-user:claude-user /home/claude-user/pagewise/
```

### 坑 4：API Key 配置问题

```bash
# 问题：Claude Code 读取 ~/.claude/settings.json 失败
# 解决：显式设置环境变量
export ANTHROPIC_API_KEY=your-api-key
export ANTHROPIC_BASE_URL=http://localhost:8090/anthropic
```

---

## 5. 实战结果

### 5.1 迭代统计

| 轮次 | 任务 | 耗时 | 代码变更 |
|------|------|------|---------|
| R1 | 统一错误处理模式 | 17s | 小 |
| R2 | JSDoc 注释补充 | 18s | 小 |
| R3 | ESLint 警告修复 | 16s | 小 |
| R4 | 知识库性能优化 | 13min | +1055 行 |
| R5 | AI 响应缓存 | 进行中 | ... |

### 5.2 生成的文档

```
docs/reports/
├── 2026-04-30-R1.md    # 迭代报告
├── 2026-04-30-R2.md
├── 2026-04-30-R3.md
└── 2026-04-30-R4.md

docs/
├── REQUIREMENTS-ITER4.md  # 需求文档
├── DESIGN-ITER4.md        # 设计文档
├── IMPLEMENTATION.md      # 实施记录
└── VERIFICATION.md        # 验证报告
```

### 5.3 测试结果

```bash
# R4 迭代测试结果
# tests 34
# suites 9
# pass 34
# fail 0
# duration_ms 267.231938
```

---

## 6. 最佳实践

### ✅ 推荐做法

| 实践 | 说明 |
|------|------|
| **7x24 运行** | systemd 服务化，自动重启 |
| **TODO.md 驱动** | 保持任务队列充足 |
| **Pre-Reading Pattern** | 避免 Claude Code 耗尽轮次读文件 |
| **每轮一个 commit** | 清晰的历史，易于回滚 |
| **自动生成报告** | 记录所有变更，便于审查 |
| **测试先行** | 每轮都运行测试，确保质量 |

### ❌ 避免做法

| 做法 | 原因 |
|------|------|
| **root 运行 Claude Code** | 安全限制，--dangerously-skip-permissions 不允许 |
| **直接传 prompt** | Shell 转义问题 |
| **跳过测试** | 无法保证质量 |
| **大步迭代** | 3+ 功能 = 高风险 |
| **不看迭代报告** | 无法发现潜在问题 |

---

## 7. 总结与展望

### 核心收获

1. **飞轮迭代有效** — 每轮完整执行 需求→设计→编码→测试→评审→文档
2. **Three-Layer Agent 架构** — Guard + Plan + Sub，职责分离
3. **Four-Document System** — REQUIREMENTS/DESIGN/IMPLEMENTATION/VERIFICATION，完整追溯
4. **Pre-Reading Pattern** — 避免 Claude Code 耗尽轮次读文件
5. **systemd 服务化** — 7x24 运行，自动重启

### 预期成果

- **每天**: 8-12 轮迭代，16-36 小时开发时间
- **每周**: 56-84 轮迭代
- **每月**: 240-360 轮迭代
- **每季度**: 720-1080 轮迭代

### 延伸阅读

- [飞轮迭代技能文档](https://github.com/whalemalus/claude-code-best-practices)
- [Claude Code 最佳实践](https://github.com/whalemalus/claude-code-best-practices)
- [PageWise 项目](https://github.com/whalemalus/pagewise)

---

> 💡 **小贴士**：如果觉得文章对你有帮助，欢迎点赞、收藏、评论交流！

*本文由 Hermes Agent 整理，基于 PageWise 项目的实战经验编写。持续迭代引擎已在生产环境运行，服务稳定。*
