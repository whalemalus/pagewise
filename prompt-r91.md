R91: BookmarkReleaseCandidate — RC 版本测试与 Bug 修复

Create tests/test-bookmark-rc.js — release candidate integration test suite:

1. Full module integration: import ALL lib/bookmark-*.js modules and test cross-module interactions
2. Data flow: Collector → Indexer → Graph → Search → Recommender → Backup → Restore
3. Edge cases: empty data, corrupted data, large datasets (500+ bookmarks)
4. Error recovery: simulate storage failures, invalid inputs, concurrent access
5. Performance regression: key operations under 200ms for 500 bookmarks
6. Version compatibility: test migration from v1 → v2 → v3 format

Rules: ES Module, no semicolons, node:test + node:assert/strict.
Target: 25+ tests covering full system integration.
Run: node --test tests/test-bookmark-rc.js
Git commit: feat(bookmark): R91 release candidate integration tests
