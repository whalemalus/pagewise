# 设计文档 — 迭代 #17: 模板/插件系统 — 社区共建技能

> 日期: 2026-04-30
> 状态: 实现中

## 背景

当前 PageWise 已具备：
- **custom-skills.js**: 用户自定义技能（IndexedDB 存储，20 个上限）
- **skill-store.js**: 从远程 API 获取技能列表
- **skill-engine.js**: 技能注册与执行引擎
- **prompt-templates.js**: 提示词模板（`{{变量}}` 语法）

但缺少社区共建能力：用户无法将自定义技能打包分享、无法通过文件导入他人技能、
没有版本管理和依赖声明、无法验证插件格式正确性。

## 需求

1. **插件包格式**: 将技能打包为标准 JSON 插件包（含元数据、版本、作者、依赖等）
2. **插件验证**: 校验插件包格式正确性（必填字段、版本格式、prompt 非空等）
3. **插件导入**: 从 JSON 文件导入插件包，安装为本地技能
4. **插件导出**: 将本地自定义技能导出为标准插件包格式
5. **版本管理**: 语义化版本号（semver），支持比较和升级检测
6. **依赖声明**: 插件可声明依赖其他插件
7. **插件注册表**: 本地注册表管理已安装插件（含状态、版本、安装时间）
8. **冲突检测**: 安装时检测 ID 冲突和版本兼容性

## 架构设计

### 核心模块: `lib/plugin-system.js`

```
┌──────────────────────────────────────────────────┐
│              PluginManifest                       │
├──────────────────────────────────────────────────┤
│ id: string (唯一标识，如 "my-plugin")              │
│ name: string (显示名称)                           │
│ version: string (semver, 如 "1.0.0")              │
│ description: string                               │
│ author: string                                    │
│ license?: string (默认 "MIT")                     │
│ category?: string (默认 "custom")                 │
│ prompt: string (技能 prompt 模板)                  │
│ parameters?: Array<{name, type, description,      │
│                     required}>                    │
│ trigger?: { type: string }                        │
│ dependencies?: Record<string, string>             │
│   (依赖插件 ID → 版本范围, 如 "^1.0.0")           │
│ minAppVersion?: string (最低 PageWise 版本)        │
│ tags?: string[]                                   │
│ homepage?: string                                 │
│ createdAt?: string (ISO)                          │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│             PluginValidator                       │
├──────────────────────────────────────────────────┤
│ validate(manifest) → ValidationResult            │
│   - id: 非空字符串，仅允许 [a-z0-9-_]             │
│   - name: 非空字符串                               │
│   - version: 有效 semver 格式                     │
│   - prompt: 非空字符串                             │
│   - license: 可选，默认 "MIT"                      │
│   - dependencies: 可选，值为有效版本范围            │
│   errors: string[]                                │
│   warnings: string[]                              │
│   valid: boolean                                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│              PluginRegistry                       │
├──────────────────────────────────────────────────┤
│ registerPlugin(manifest) → Promise<void>          │
│ unregisterPlugin(id) → Promise<void>              │
│ getInstalled() → Promise<InstalledPlugin[]>       │
│ isInstalled(id) → Promise<boolean>                │
│ getPlugin(id) → Promise<InstalledPlugin|null>     │
│ updatePluginStatus(id, status) → Promise<void>    │
│ checkConflicts(manifest) → Promise<Conflict[]>    │
├──────────────────────────────────────────────────┤
│ InstalledPlugin {                                 │
│   ...manifest,                                    │
│   status: 'installed'|'disabled',                 │
│   installedAt: number,                            │
│   updatedAt: number                               │
│ }                                                 │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│             PluginManager                         │
├──────────────────────────────────────────────────┤
│ install(pluginJson) → Promise<InstalledPlugin>    │
│ uninstall(id) → Promise<void>                     │
│ enable(id) → Promise<void>                        │
│ disable(id) → Promise<void>                       │
│ exportPlugin(skillId) → Promise<PluginManifest>   │
│ exportAll() → Promise<PluginManifest[]>           │
│ importPlugin(json) → Promise<InstalledPlugin>     │
│ importBatch(jsonArray) → Promise<ImportResult>    │
│ getUpdatable() → Promise<UpdatablePlugin[]>       │
└──────────────────────────────────────────────────┘
```

### 插件包 JSON 格式

```json
{
  "id": "translate-skill",
  "name": "翻译助手",
  "version": "1.2.0",
  "description": "将内容翻译为指定语言",
  "author": "社区用户",
  "license": "MIT",
  "category": "translation",
  "prompt": "请将以下内容翻译为 {{targetLang}}：\n\n{{content}}",
  "parameters": [
    { "name": "targetLang", "type": "string", "description": "目标语言", "required": true },
    { "name": "content", "type": "string", "description": "要翻译的内容", "required": true }
  ],
  "trigger": { "type": "manual" },
  "tags": ["翻译", "i18n"],
  "homepage": "https://github.com/example/translate-skill"
}
```

### 与现有系统集成

```
PluginManager.install(json)
    ↓
PluginValidator.validate(json)  ← 验证格式
    ↓
PluginRegistry.checkConflicts(json)  ← 检查冲突
    ↓
PluginRegistry.registerPlugin(json)  ← 注册到 IndexedDB
    ↓
saveCustomSkill(json)  ← 调用现有 custom-skills.js 保存技能
    ↓
SkillEngine.register(json)  ← 运行时注册到技能引擎
```

### 版本比较（简化 semver）

使用 `compareVersions(a, b)` 实现标准 semver 三段比较：
- `major.minor.patch` 格式
- 支持 pre-release 标签（如 `1.0.0-beta.1`）
- `satisfiesVersion(version, range)` 支持 `^`、`>=`、`~` 范围前缀

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `lib/plugin-system.js` |
| 新增 | `tests/test-plugin-system.js` |
| 修改 | `sidebar/sidebar.js`（集成插件系统） |
| 修改 | `docs/IMPLEMENTATION.md` |
| 修改 | `docs/CHANGELOG.md` |
| 修改 | `docs/TODO.md` |
