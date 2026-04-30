/**
 * 测试 lib/git-repo.js — L1.4 Git 集成
 *
 * 纯 JavaScript Git 仓库实现，用于导出的 wiki 目录自动初始化为 Git 仓库。
 * 22 个场景覆盖：
 *   1-4:   hashObject / compressObject — Git 对象哈希和压缩
 *   5-7:   initRepo — 仓库初始化
 *   8-10:  writeBlob — Blob 对象写入
 *   11-13: writeTree — Tree 对象构建
 *   14-17: createCommit / commit — 提交创建
 *   18-19: stageAll / getStatus — 暂存区管理
 *   20-22: commitWikiExport / formatCommitMessage / pushToGitHub — 导出集成
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  hashObject,
  compressObject,
  decompressObject,
  initRepo,
  writeBlob,
  writeTree,
  createCommit,
  commit,
  stageAll,
  getStatus,
  readRef,
  commitWikiExport,
  formatCommitMessage,
  pushToGitHub,
  InMemoryFS,
} from '../lib/git-repo.js';

// ==================== Test Helpers ====================

/**
 * 创建一个已初始化的仓库 InMemoryFS
 */
async function createInitRepo() {
  const fs = new InMemoryFS();
  await initRepo(fs);
  return fs;
}

/**
 * 往 InMemoryFS 写入文件
 */
async function writeFile(fs, path, content) {
  const dirs = path.split('/').slice(0, -1);
  let current = fs.root;
  for (const dir of dirs) {
    if (!current.children.has(dir)) {
      current.children.set(dir, {
        kind: 'directory',
        name: dir,
        children: new Map(),
        parent: current,
      });
    }
    current = current.children.get(dir);
  }
  const fileName = path.split('/').pop();
  current.children.set(fileName, {
    kind: 'file',
    name: fileName,
    content: typeof content === 'string' ? new TextEncoder().encode(content) : content,
    parent: current,
  });
}

// ==================== Tests ====================

describe('git-repo — hashObject / compressObject', () => {

  // ---- 1. SHA-1 哈希正确性 ----
  it('对 Git 对象格式 (type + size + NUL + content) 计算 SHA-1', async () => {
    const content = new TextEncoder().encode('hello world\n');
    const hash = await hashObject('blob', content);
    // Git 标准: echo "hello world\n" | git hash-object --stdin → 3b18e512dba79e4c8300dd08aeb37f8e728b8dad
    assert.equal(hash, '3b18e512dba79e4c8300dd08aeb37f8e728b8dad');
  });

  // ---- 2. 空内容哈希 ----
  it('空内容返回有效的 40 字符 SHA-1', async () => {
    const empty = new Uint8Array(0);
    const hash = await hashObject('blob', empty);
    assert.equal(hash.length, 40, '哈希应为 40 字符');
    assert.match(hash, /^[0-9a-f]{40}$/, '哈希应为小写十六进制');
  });

  // ---- 3. 压缩/解压缩往返 ----
  it('compressObject + decompressObject 往返保真', async () => {
    const original = new TextEncoder().encode('hello git objects');
    const compressed = await compressObject(original);
    assert.ok(compressed.length > 0, '压缩后应非空');
    assert.ok(compressed.length < original.length + 50, '压缩后应更短或接近');

    const decompressed = await decompressObject(compressed);
    assert.deepEqual(decompressed, original, '解压缩后应与原始内容相同');
  });

  // ---- 4. 不同类型生成不同哈希 ----
  it('blob 和 tree 类型使用相同内容产生不同哈希', async () => {
    const content = new TextEncoder().encode('test');
    const blobHash = await hashObject('blob', content);
    const treeHash = await hashObject('tree', content);
    assert.notEqual(blobHash, treeHash, '不同类型应产生不同哈希');
  });

});

describe('git-repo — initRepo', () => {

  // ---- 5. 初始化创建 .git 目录结构 ----
  it('initRepo 创建完整的 .git 目录结构', async () => {
    const fs = new InMemoryFS();
    await initRepo(fs);

    const gitDir = await fs.getDirectoryHandle('.git');
    assert.ok(gitDir, '应创建 .git 目录');

    const objects = await fs.getDirectoryHandle('.git/objects');
    assert.ok(objects, '应创建 .git/objects 目录');

    const refs = await fs.getDirectoryHandle('.git/refs');
    assert.ok(refs, '应创建 .git/refs 目录');

    const heads = await fs.getDirectoryHandle('.git/refs/heads');
    assert.ok(heads, '应创建 .git/refs/heads 目录');
  });

  // ---- 6. HEAD 指向 main 分支 ----
  it('HEAD 文件指向 refs/heads/main', async () => {
    const fs = new InMemoryFS();
    await initRepo(fs);

    const headHandle = await fs.getFileHandle('.git/HEAD');
    const headFile = await headHandle.getFile();
    const headContent = await headFile.text();
    assert.equal(headContent.trim(), 'ref: refs/heads/main');
  });

  // ---- 7. 重复初始化不报错 ----
  it('重复调用 initRepo 不抛出异常', async () => {
    const fs = new InMemoryFS();
    await initRepo(fs);
    // 第二次初始化不应抛出
    await initRepo(fs);
  });

});

describe('git-repo — writeBlob', () => {

  // ---- 8. 写入 blob 并返回正确哈希 ----
  it('writeBlob 将内容写入对象数据库并返回 SHA-1', async () => {
    const fs = await createInitRepo();
    const content = new TextEncoder().encode('Hello, Git!');
    const hash = await writeBlob(fs, content);

    assert.equal(hash.length, 40, '应返回 40 字符哈希');
    assert.match(hash, /^[0-9a-f]{40}$/);
  });

  // ---- 9. 相同内容不重复写入 ----
  it('相同内容的多次 writeBlob 返回相同哈希', async () => {
    const fs = await createInitRepo();
    const content = new TextEncoder().encode('same content');
    const hash1 = await writeBlob(fs, content);
    const hash2 = await writeBlob(fs, content);
    assert.equal(hash1, hash2, '相同内容应返回相同哈希');
  });

  // ---- 10. Blob 文件存在于对象数据库 ----
  it('写入的 blob 对象文件存在于 .git/objects/', async () => {
    const fs = await createInitRepo();
    const content = new TextEncoder().encode('test blob');
    const hash = await writeBlob(fs, content);

    const prefix = hash.slice(0, 2);
    const suffix = hash.slice(2);
    const objDir = await fs.getDirectoryHandle(`.git/objects/${prefix}`);
    assert.ok(objDir, '对象子目录应存在');
    const objFile = await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`);
    assert.ok(objFile, '对象文件应存在');
  });

});

describe('git-repo — writeTree', () => {

  // ---- 11. 从文件列表构建 tree ----
  it('writeTree 从文件路径+哈希列表构建 Git tree 对象', async () => {
    const fs = await createInitRepo();

    const entries = [
      { name: 'readme.md', hash: 'a'.repeat(40), mode: '100644' },
      { name: 'index.md', hash: 'b'.repeat(40), mode: '100640' },
    ];
    const treeHash = await writeTree(fs, entries);

    assert.equal(treeHash.length, 40, '应返回 40 字符哈希');
    assert.match(treeHash, /^[0-9a-f]{40}$/);
  });

  // ---- 12. 空 tree 哈希 ----
  it('空 entries 列表产生空 tree 的固定哈希', async () => {
    const fs = await createInitRepo();
    const treeHash = await writeTree(fs, []);
    assert.equal(treeHash.length, 40);
  });

  // ---- 13. 子目录 tree 引用 ----
  it('支持 tree 条目（mode 040000）用于子目录', async () => {
    const fs = await createInitRepo();
    const subTreeHash = 'c'.repeat(40);
    const entries = [
      { name: 'subdir', hash: subTreeHash, mode: '040000' },
      { name: 'file.md', hash: 'd'.repeat(40), mode: '100644' },
    ];
    const treeHash = await writeTree(fs, entries);
    assert.equal(treeHash.length, 40);
  });

});

describe('git-repo — createCommit / commit', () => {

  // ---- 14. 创建初始 commit ----
  it('createCommit 生成正确的 commit 对象并更新 HEAD ref', async () => {
    const fs = await createInitRepo();
    const treeHash = await writeTree(fs, [
      { name: 'index.md', hash: 'a'.repeat(40), mode: '100644' },
    ]);
    const commitHash = await createCommit(fs, treeHash, 'initial commit', []);

    assert.equal(commitHash.length, 40, '应返回 40 字符 commit 哈希');

    // HEAD ref 应更新
    const refValue = await readRef(fs, 'refs/heads/main');
    assert.equal(refValue, commitHash, 'refs/heads/main 应指向新 commit');
  });

  // ---- 15. 链式 commit（parent 引用） ----
  it('后续 commit 引用前一个 commit 作为 parent', async () => {
    const fs = await createInitRepo();

    const tree1 = await writeTree(fs, [
      { name: 'index.md', hash: 'a'.repeat(40), mode: '100644' },
    ]);
    const commit1 = await createCommit(fs, tree1, 'first commit', []);

    const tree2 = await writeTree(fs, [
      { name: 'index.md', hash: 'b'.repeat(40), mode: '100644' },
    ]);
    const commit2 = await createCommit(fs, tree2, 'second commit', [commit1]);

    const refValue = await readRef(fs, 'refs/heads/main');
    assert.equal(refValue, commit2, 'HEAD 应指向最新 commit');
  });

  // ---- 16. commit 内容格式正确 ----
  it('commit 对象包含 tree、author、committer 和 message', async () => {
    const fs = await createInitRepo();
    const treeHash = await writeTree(fs, []);
    const commitHash = await createCommit(fs, treeHash, 'test message\n\n详细描述', []);

    // 从对象数据库读取 commit 内容
    const prefix = commitHash.slice(0, 2);
    const suffix = commitHash.slice(2);
    const objFile = await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`);
    const compressed = new Uint8Array(await (await objFile.getFile()).arrayBuffer());
    const raw = await decompressObject(compressed);
    const content = new TextDecoder().decode(raw);

    assert.ok(content.startsWith('tree '), '应以 tree 开头');
    assert.ok(content.includes('author '), '应包含 author');
    assert.ok(content.includes('committer '), '应包含 committer');
    assert.ok(content.includes('test message'), '应包含提交信息');
  });

  // ---- 17. commit 函数端到端 ----
  it('commit() 从 InMemoryFS 工作目录自动生成 tree 并提交', async () => {
    const fs = await createInitRepo();
    await writeFile(fs, 'wiki/index.md', '# Index\nPage content');
    await writeFile(fs, 'wiki/entries/test.md', '# Test\nTest content');

    const commitHash = await commit(fs, 'ingest: 1 new entry, 0 updated pages');
    assert.equal(commitHash.length, 40);

    const refValue = await readRef(fs, 'refs/heads/main');
    assert.equal(refValue, commitHash);
  });

});

describe('git-repo — stageAll / getStatus', () => {

  // ---- 18. stageAll 暂存工作目录所有文件 ----
  it('stageAll 将工作目录文件写入暂存区', async () => {
    const fs = await createInitRepo();
    await writeFile(fs, 'wiki/index.md', '# Index');
    await writeFile(fs, 'wiki/entries/page1.md', '# Page 1');

    const staged = await stageAll(fs);
    assert.ok(staged.length > 0, '应暂存至少 1 个文件');
    assert.ok(staged.some(f => f.path.includes('index.md')), '应包含 index.md');
    assert.ok(staged.some(f => f.path.includes('page1.md')), '应包含 page1.md');
    assert.ok(staged.every(f => f.hash && f.hash.length === 40), '每个文件应有 40 字符哈希');
  });

  // ---- 19. getStatus 返回变更状态 ----
  it('getStatus 对比暂存区和工作目录返回变更文件列表', async () => {
    const fs = await createInitRepo();
    await writeFile(fs, 'index.md', '# Initial');
    await stageAll(fs);

    // 修改文件
    await writeFile(fs, 'index.md', '# Modified');
    // 添加新文件
    await writeFile(fs, 'new.md', '# New');

    const status = await getStatus(fs);
    assert.ok(status.modified.length > 0 || status.untracked.length > 0,
      '应检测到文件变更');
  });

});

describe('git-repo — formatCommitMessage', () => {

  // ---- 20. 基本格式化 ----
  it('格式化 ingest commit message', () => {
    const msg = formatCommitMessage({ newEntries: 3, updatedPages: 2 });
    assert.equal(msg, 'ingest: 3 new entries, 2 updated pages');
  });

  // ---- 21. 单数形式 ----
  it('单数条目使用正确形式', () => {
    const msg1 = formatCommitMessage({ newEntries: 1, updatedPages: 0 });
    assert.equal(msg1, 'ingest: 1 new entry, 0 updated pages');

    const msg2 = formatCommitMessage({ newEntries: 0, updatedPages: 1 });
    assert.equal(msg2, 'ingest: 0 new entries, 1 updated page');
  });

  // ---- 22. 零条目 ----
  it('零条目仍生成有效消息', () => {
    const msg = formatCommitMessage({ newEntries: 0, updatedPages: 0 });
    assert.ok(msg.startsWith('ingest:'));
  });

});

describe('git-repo — commitWikiExport', () => {

  it('一键完成 stageAll + commit 流程', async () => {
    const fs = await createInitRepo();
    await writeFile(fs, 'wiki/index.md', '# Wiki Index');
    await writeFile(fs, 'wiki/entities/docker.md', '# Docker');
    await writeFile(fs, 'wiki/entries/test.md', '# Test');

    const result = await commitWikiExport(fs, { newEntries: 3, updatedPages: 0 });
    assert.ok(result.commitHash, '应返回 commit hash');
    assert.equal(result.commitHash.length, 40);
    assert.ok(result.message.includes('ingest:'), '消息应包含 ingest:');

    // 验证 HEAD 更新
    const refValue = await readRef(fs, 'refs/heads/main');
    assert.equal(refValue, result.commitHash);
  });

  it('二次导出产生链式 commit', async () => {
    const fs = await createInitRepo();

    // 第一次导出
    await writeFile(fs, 'wiki/index.md', '# Wiki Index');
    const result1 = await commitWikiExport(fs, { newEntries: 1, updatedPages: 0 });

    // 第二次导出（添加新文件）
    await writeFile(fs, 'wiki/entries/new-page.md', '# New Page');
    const result2 = await commitWikiExport(fs, { newEntries: 1, updatedPages: 0 });

    assert.notEqual(result1.commitHash, result2.commitHash, '两次 commit 应不同');

    const head = await readRef(fs, 'refs/heads/main');
    assert.equal(head, result2.commitHash, 'HEAD 应指向第二次 commit');
  });

});

describe('git-repo — pushToGitHub', () => {

  it('pushToGitHub 存在且是函数', () => {
    assert.equal(typeof pushToGitHub, 'function', 'pushToGitHub 应为函数');
  });

  it('缺少 token 时抛出错误', async () => {
    const fs = await createInitRepo();
    await assert.rejects(
      () => pushToGitHub(fs, { owner: 'user', repo: 'wiki' }),
      /token/i,
      '缺少 token 应抛出包含 token 的错误'
    );
  });

  it('缺少 owner/repo 时抛出错误', async () => {
    const fs = await createInitRepo();
    await assert.rejects(
      () => pushToGitHub(fs, { token: 'ghp_test' }),
      /owner.*repo|repo.*owner/i,
      '缺少 owner/repo 应抛出错误'
    );
  });

});

describe('git-repo — InMemoryFS', () => {

  it('创建和获取目录句柄', async () => {
    const fs = new InMemoryFS();
    const dir = await fs.getDirectoryHandle('test', { create: true });
    assert.ok(dir, '应返回目录句柄');
    assert.equal(dir.name, 'test');
  });

  it('创建和获取文件句柄', async () => {
    const fs = new InMemoryFS();
    await fs.getDirectoryHandle('dir', { create: true });
    const file = await fs.getFileHandle('dir/file.txt', { create: true });
    assert.ok(file, '应返回文件句柄');
  });

  it('嵌套路径自动创建', async () => {
    const fs = new InMemoryFS();
    const dir = await fs.getDirectoryHandle('a/b/c', { create: true });
    assert.ok(dir, '深层嵌套目录应自动创建');
  });

  it('listAllFiles 递归列出所有文件', async () => {
    const fs = new InMemoryFS();
    await writeFile(fs, 'a/b/file1.md', 'content1');
    await writeFile(fs, 'a/file2.md', 'content2');
    await writeFile(fs, 'root.md', 'content3');

    const files = await fs.listAllFiles();
    const paths = files.map(f => f.path);
    assert.ok(paths.includes('a/b/file1.md'));
    assert.ok(paths.includes('a/file2.md'));
    assert.ok(paths.includes('root.md'));
  });

  it('写入和读取文件内容', async () => {
    const fs = new InMemoryFS();
    await writeFile(fs, 'test.md', '# Hello');

    const handle = await fs.getFileHandle('test.md');
    const file = await handle.getFile();
    const content = await file.text();
    assert.equal(content, '# Hello');
  });

});
