# R89: 备份恢复 BookmarkBackupRestore

## 任务
实现书签数据备份与恢复系统 — `lib/bookmark-backup.js`

## 需求
1. **备份功能**: `createBackup(options)` — 将所有书签数据（含图谱、标签、状态、聚类）打包为 JSON
2. **恢复功能**: `restoreBackup(backupData, options)` — 从备份数据恢复，支持合并/覆盖两种模式
3. **自动备份策略**: `scheduleAutoBackup(interval)` — 基于 chrome.alarms 定时备份
4. **备份管理**: `listBackups()` / `deleteBackup(id)` — 管理多个备份版本（存储在 chrome.storage.local）
5. **增量备份**: `createIncrementalBackup(lastBackupTime)` — 只备份变更部分
6. **备份验证**: `validateBackup(backupData)` — 校验备份数据完整性和版本兼容性
7. **导出备份**: `exportBackupToFile(backupId, format)` — 导出为 JSON/CSV 文件

## 技术约束
- 纯 ES Module，无构建工具
- 复用 `lib/bookmark-io.js` 的导入导出能力
- 复用 `lib/bookmark-migration.js` 的版本兼容检查
- Chrome Storage API 存储备份元数据，IndexedDB 存储完整数据
- 所有异步操作 try-catch

## 测试要求
- 使用 `node:test` + `node:assert/strict`
- Chrome API mock: `tests/helpers/chrome-mock.js`
- 最少 20 个测试用例，覆盖：创建/恢复/增量/验证/管理/边界情况
- 测试文件: `tests/test-bookmark-backup.js`
- **运行 `node --test tests/test-bookmark-backup.js` 确认全部通过**

## 质量门控
- JSDoc 注释
- 错误处理完善
- 测试 ≥ 20 用例且全部通过
- 完成后 git commit: `feat(bookmark): R89 backup and restore system`
