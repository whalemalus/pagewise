Create lib/bookmark-backup.js with these functions:

1. createBackup(bookmarks, options) - package bookmark data as JSON backup object with {version, timestamp, data, checksum}
2. restoreBackup(backupData) - validate and return restored data
3. validateBackup(backupData) - check structure integrity, version compatibility
4. createIncrementalBackup(bookmarks, lastBackupTime) - only include bookmarks modified after lastBackupTime
5. listStoredBackups() - return backup metadata list from storage
6. deleteStoredBackup(backupId) - remove a stored backup

Rules:
- ES Module, no semicolons, const/let, JSDoc comments
- Use try-catch for all async ops
- Pure data module - no Chrome API dependency (storage ops use injected store adapter)
- Export: { BookmarkBackup }

Then create tests/test-bookmark-backup.js with 20+ test cases using node:test and node:assert/strict.
Cover: create/restore/validate/incremental/list/delete/error cases/version mismatch.

Run: node --test tests/test-bookmark-backup.js
Must all pass before committing.

Git commit: feat(bookmark): R89 backup and restore system
