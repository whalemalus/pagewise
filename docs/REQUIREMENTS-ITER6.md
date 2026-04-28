# 迭代 #6 需求文档 — 技能生态

## 需求概览

| ID | 需求 | 优先级 | 涉及文件 |
|----|------|--------|----------|
| R046 | 本地技能导入 | P2 | sidebar.html, sidebar.js, sidebar.css, lib/custom-skills.js |
| R047 | 在线技能商店 | P2 | sidebar.html, sidebar.js, sidebar.css, lib/skill-store.js (新建) |

---

## R046: 本地技能导入

### 描述
用户可以通过文件选择器导入本地的技能文件（MD 或 JSON 格式），导入后存储到 IndexedDB 中作为自定义技能。

### 文件格式支持

**JSON 格式**（标准技能格式）：
```json
{
  "id": "my-skill",
  "name": "我的技能",
  "description": "技能描述",
  "category": "custom",
  "parameters": [
    { "name": "input", "type": "string", "description": "输入内容", "required": true }
  ],
  "prompt": "请分析以下内容：\n{{input}}"
}
```

**Markdown 格式**（简化格式）：
```markdown
---
id: my-skill
name: 我的技能
description: 技能描述
category: custom
---

请分析以下内容：
{{input}}
```

### 实现方案
1. 在技能列表 header 添加"📥 导入"按钮
2. 点击后触发 `<input type="file" accept=".json,.md,.markdown">` 
3. 读取文件内容，解析为技能对象
4. JSON 格式：直接 JSON.parse
5. MD 格式：解析 frontmatter（YAML 头部）+ 正文作为 prompt
6. 验证必填字段（id, name, description）
7. 存储到 IndexedDB（复用现有的 custom-skills.js 的 saveSkill）
8. 如果有 prompt 字段，execute 函数自动生成为：调用 ai.chat 发送 prompt

### 注意事项
- 导入的技能如果 id 已存在，提示"技能已存在，是否覆盖？"
- 文件大小限制 100KB
- 导入后自动刷新技能列表

---

## R047: 在线技能商店

### 描述
从 ClawHub 等在线平台获取技能列表，用户可以一键安装。

### 实现方案
1. 新建 lib/skill-store.js — 技能商店客户端
2. 在技能 tab 添加"🏪 商店"分类标签
3. 点击商店标签后从 API 拉取技能列表
4. 显示技能卡片（名称、描述、作者、安装数）
5. 点击"安装"按钮下载技能 JSON 并保存到 IndexedDB

### API 设计
由于 ClawHub API 可能不存在或不稳定，设计为可配置的：
- 默认 API: `https://api.clawhub.com/v1/skills`（如果存在）
- 备选：使用 GitHub 仓库作为技能源
- 如果 API 不可用，显示"暂无在线技能"并提示用户手动导入

### 技能商店卡片 UI
```
┌─────────────────────────────────┐
│ 📦 技能名称        by 作者名    │
│ 技能描述文字...                 │
│ ⬇️ 128 次安装   [安装]          │
└─────────────────────────────────┘
```

### 注意事项
- 安装前检查是否已安装（id 重复）
- 网络错误时优雅降级
- 不阻塞主界面加载
