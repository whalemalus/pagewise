/**
 * Git Repo — 纯 JS Git 仓库实现 (L1.4)
 *
 * 用于导出的 wiki 目录自动初始化为 Git 仓库。
 * 无需系统 git 依赖，可在 Chrome Extension 环境中运行。
 */

import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

// ==================== InMemoryFS ====================

/**
 * 内存文件系统，模拟 File System Access API
 */
export class InMemoryFS {
  constructor() {
    this.root = { kind: 'directory', name: '', children: new Map() };
  }

  /**
   * 解析路径并找到父目录
   * @private
   */
  _resolveParent(path) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return this.root;
    const dirParts = parts.slice(0, -1);
    let current = this.root;
    for (const part of dirParts) {
      if (!current.children.has(part)) {
        current.children.set(part, { kind: 'directory', name: part, children: new Map() });
      }
      current = current.children.get(part);
    }
    return current;
  }

  /**
   * 获取目录句柄
   * @param {string} path
   * @param {Object} [options]
   * @param {boolean} [options.create]
   * @returns {Promise<Object>}
   */
  async getDirectoryHandle(path, options = {}) {
    const parts = path.split('/').filter(Boolean);
    let current = this.root;
    for (const part of parts) {
      if (!current.children.has(part)) {
        if (!options.create) throw new Error(`目录不存在: ${part}`);
        current.children.set(part, { kind: 'directory', name: part, children: new Map() });
      }
      current = current.children.get(part);
    }
    return {
      name: parts[parts.length - 1] || '',
      kind: 'directory',
      children: current.children,
    };
  }

  /**
   * 获取文件句柄
   * @param {string} path
   * @param {Object} [options]
   * @param {boolean} [options.create]
   * @returns {Promise<Object>}
   */
  async getFileHandle(path, options = {}) {
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    let current = this.root;
    for (const part of parts) {
      if (!current.children.has(part)) {
        if (!options.create) throw new Error(`目录不存在: ${part}`);
        current.children.set(part, { kind: 'directory', name: part, children: new Map() });
      }
      current = current.children.get(part);
    }
    if (!current.children.has(fileName)) {
      if (!options.create) throw new Error(`文件不存在: ${fileName}`);
      current.children.set(fileName, {
        kind: 'file',
        name: fileName,
        content: new Uint8Array(0),
      });
    }
    const node = current.children.get(fileName);
    return {
      name: fileName,
      kind: 'file',
      getFile: async () => ({
        text: async () => new TextDecoder().decode(node.content),
        arrayBuffer: async () => node.content.buffer.slice(
          node.content.byteOffset,
          node.content.byteOffset + node.content.byteLength
        ),
        size: node.content.length,
      }),
    };
  }

  /**
   * 递归列出所有文件
   * @returns {Promise<Array<{path: string, content: Uint8Array}>>}
   */
  async listAllFiles() {
    const result = [];
    const walk = (dir, prefix) => {
      for (const [name, child] of dir.children) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (child.kind === 'file') {
          result.push({ path, content: child.content });
        } else if (child.kind === 'directory' && name !== '.git') {
          walk(child, path);
        }
      }
    };
    walk(this.root, '');
    return result;
  }
}

// ==================== Git 对象工具 ====================

/**
 * 计算 Git 对象的 SHA-1 哈希
 * @param {string} type - 对象类型 (blob/tree/commit)
 * @param {Uint8Array} content - 对象内容
 * @returns {Promise<string>} 40 字符小写十六进制哈希
 */
export async function hashObject(type, content) {
  const header = new TextEncoder().encode(`${type} ${content.length}\0`);
  const store = new Uint8Array(header.length + content.length);
  store.set(header);
  store.set(content, header.length);
  return createHash('sha1').update(store).digest('hex');
}

/**
 * 使用 zlib 压缩数据
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export async function compressObject(data) {
  return new Uint8Array(deflateSync(data));
}

/**
 * 使用 zlib 解压数据
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export async function decompressObject(data) {
  return new Uint8Array(inflateSync(data));
}

// ==================== 仓库初始化 ====================

/**
 * 初始化 Git 仓库
 * @param {InMemoryFS} fs
 */
export async function initRepo(fs) {
  await fs.getDirectoryHandle('.git/objects', { create: true });
  await fs.getDirectoryHandle('.git/refs/heads', { create: true });

  const headHandle = await fs.getFileHandle('.git/HEAD', { create: true });
  const node = _getNode(fs, '.git/HEAD');
  node.content = new TextEncoder().encode('ref: refs/heads/main\n');
}

// ==================== Blob / Tree ====================

/**
 * 写入 blob 对象
 * @param {InMemoryFS} fs
 * @param {Uint8Array} content
 * @returns {Promise<string>} blob 哈希
 */
export async function writeBlob(fs, content) {
  const hash = await hashObject('blob', content);
  const compressed = await compressObject(
    new TextEncoder().encode(`blob ${content.length}\0`)
      .length ? (() => {
        const header = new TextEncoder().encode(`blob ${content.length}\0`);
        const store = new Uint8Array(header.length + content.length);
        store.set(header);
        store.set(content, header.length);
        return store;
      })() : content
  );
  const prefix = hash.slice(0, 2);
  const suffix = hash.slice(2);
  await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true });
  const handle = await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true });
  const node = _getNode(fs, `.git/objects/${prefix}/${suffix}`);
  node.content = await compressObject(
    (() => {
      const header = new TextEncoder().encode(`blob ${content.length}\0`);
      const store = new Uint8Array(header.length + content.length);
      store.set(header);
      store.set(content, header.length);
      return store;
    })()
  );
  return hash;
}

/**
 * 写入 tree 对象
 * @param {InMemoryFS} fs
 * @param {Array<{name: string, hash: string, mode: string}>} entries
 * @returns {Promise<string>} tree 哈希
 */
export async function writeTree(fs, entries) {
  const parts = [];
  for (const entry of entries) {
    parts.push(new TextEncoder().encode(`${entry.mode} ${entry.name}\0`));
    parts.push(_hexToBytes(entry.hash));
  }

  let totalLength = 0;
  for (const p of parts) totalLength += p.length;
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const p of parts) {
    body.set(p, offset);
    offset += p.length;
  }

  const hash = await hashObject('tree', body);
  const prefix = hash.slice(0, 2);
  const suffix = hash.slice(2);
  await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true });
  await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true });
  _getNode(fs, `.git/objects/${prefix}/${suffix}`).content =
    await compressObject(new TextEncoder().encode(`tree ${body.length}\0`).length
      ? (() => {
        const hdr = new TextEncoder().encode(`tree ${body.length}\0`);
        const full = new Uint8Array(hdr.length + body.length);
        full.set(hdr);
        full.set(body, hdr.length);
        return full;
      })()
      : body
    );

  return hash;
}

// ==================== Commit ====================

/**
 * 创建 commit 对象
 * @param {InMemoryFS} fs
 * @param {string} treeHash
 * @param {string} message
 * @param {string[]} parents
 * @returns {Promise<string>} commit 哈希
 */
export async function createCommit(fs, treeHash, message, parents = []) {
  const timestamp = formatTimestamp(new Date());
  const author = 'PageWise <pagewise@local>';

  let content = `tree ${treeHash}\n`;
  for (const parent of parents) {
    content += `parent ${parent}\n`;
  }
  content += `author ${author} ${timestamp}\n`;
  content += `committer ${author} ${timestamp}\n`;
  content += `\n${message}\n`;

  const contentBytes = new TextEncoder().encode(content);
  const hash = await hashObject('commit', contentBytes);

  const prefix = hash.slice(0, 2);
  const suffix = hash.slice(2);
  await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true });
  await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true });
  _getNode(fs, `.git/objects/${prefix}/${suffix}`).content =
    await compressObject(contentBytes);

  const headRef = await _readHeadRef(fs);
  const refPath = `.git/${headRef}`;
  const parts = refPath.split('/').filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    await fs.getDirectoryHandle(parts.slice(0, i).join('/'), { create: true });
  }
  await fs.getFileHandle(refPath, { create: true });
  _getNode(fs, refPath).content = new TextEncoder().encode(hash + '\n');

  return hash;
}

/**
 * 自动从工作目录生成 tree 并提交
 * @param {InMemoryFS} fs
 * @param {string} message
 * @returns {Promise<string>} commit 哈希
 */
export async function commit(fs, message) {
  const allFiles = await fs.listAllFiles();

  // Hash all files as blobs
  const fileHashes = [];
  for (const file of allFiles) {
    const hash = await hashObject('blob', file.content);
    const prefix = hash.slice(0, 2);
    const suffix = hash.slice(2);
    await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true });
    await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true });
    _getNode(fs, `.git/objects/${prefix}/${suffix}`).content =
      await compressObject(
        (() => {
          const hdr = new TextEncoder().encode(`blob ${file.content.length}\0`);
          const full = new Uint8Array(hdr.length + file.content.length);
          full.set(hdr);
          full.set(file.content, hdr.length);
          return full;
        })()
      );
    fileHashes.push({ path: file.path, hash });
  }

  // Build tree entries (handle nested directories)
  const treeEntries = await _buildTreeEntries(fs, fileHashes);
  const treeHash = await writeTree(fs, treeEntries);

  // Determine parents
  const existingHead = await readRef(fs, 'refs/heads/main');
  const parents = existingHead ? [existingHead] : [];

  return await createCommit(fs, treeHash, message, parents);
}

// ==================== 暂存区 / 状态 ====================

/**
 * 暂存所有工作目录文件
 * @param {InMemoryFS} fs
 * @returns {Promise<Array<{path: string, hash: string}>>}
 */
export async function stageAll(fs) {
  const allFiles = await fs.listAllFiles();
  const index = [];

  for (const file of allFiles) {
    const hash = await hashObject('blob', file.content);
    // 写入对象数据库
    const prefix = hash.slice(0, 2);
    const suffix = hash.slice(2);
    await fs.getDirectoryHandle(`.git/objects/${prefix}`, { create: true });
    await fs.getFileHandle(`.git/objects/${prefix}/${suffix}`, { create: true });
    _getNode(fs, `.git/objects/${prefix}/${suffix}`).content =
      await compressObject(
        (() => {
          const hdr = new TextEncoder().encode(`blob ${file.content.length}\0`);
          const full = new Uint8Array(hdr.length + file.content.length);
          full.set(hdr);
          full.set(file.content, hdr.length);
          return full;
        })()
      );
    index.push({ path: file.path, hash });
  }

  // 写入 index 文件
  const indexContent = index.map(e => `${e.hash} ${e.path}`).join('\n') + '\n';
  await fs.getFileHandle('.git/index', { create: true });
  _getNode(fs, '.git/index').content = new TextEncoder().encode(indexContent);

  return index;
}

/**
 * 获取工作目录状态
 * @param {InMemoryFS} fs
 * @returns {Promise<{modified: string[], untracked: string[], deleted: string[]}>}
 */
export async function getStatus(fs) {
  const indexData = await _readIndex(fs);
  const allFiles = await fs.listAllFiles();
  const status = { modified: [], untracked: [], deleted: [] };

  // 检查 index 中的文件
  for (const entry of indexData) {
    const file = allFiles.find(f => f.path === entry.path);
    if (!file) {
      status.deleted.push(entry.path);
    } else {
      const currentHash = await hashObject('blob', file.content);
      if (currentHash !== entry.hash) {
        status.modified.push(entry.path);
      }
    }
  }

  // 检查新增文件
  for (const file of allFiles) {
    if (!indexData.find(e => e.path === file.path)) {
      status.untracked.push(file.path);
    }
  }

  return status;
}

/**
 * 读取 ref 值
 * @param {InMemoryFS} fs
 * @param {string} ref - 如 "refs/heads/main"
 * @returns {Promise<string|null>}
 */
export async function readRef(fs, ref) {
  try {
    const handle = await fs.getFileHandle(`.git/${ref}`);
    const file = await handle.getFile();
    const content = await file.text();
    return content.trim() || null;
  } catch {
    return null;
  }
}

// ==================== 导出集成 ====================

/**
 * 格式化 ingest commit message
 * @param {{newEntries: number, updatedPages: number}} stats
 * @returns {string}
 */
export function formatCommitMessage({ newEntries = 0, updatedPages = 0 } = {}) {
  const entryWord = newEntries === 1 ? 'entry' : 'entries';
  const pageWord = updatedPages === 1 ? 'page' : 'pages';
  return `ingest: ${newEntries} new ${entryWord}, ${updatedPages} updated ${pageWord}`;
}

/**
 * 一键完成 stageAll + commit
 * @param {InMemoryFS} fs
 * @param {{newEntries: number, updatedPages: number}} stats
 * @returns {Promise<{commitHash: string, message: string}>}
 */
export async function commitWikiExport(fs, stats = {}) {
  await stageAll(fs);
  const message = formatCommitMessage(stats);
  const commitHash = await commit(fs, message);
  return { commitHash, message };
}

/**
 * 推送到 GitHub（需要 token）
 * @param {InMemoryFS} fs
 * @param {{token?: string, owner?: string, repo?: string}} options
 */
export async function pushToGitHub(fs, options = {}) {
  if (!options.token) {
    throw new Error('缺少 GitHub token');
  }
  if (!options.owner || !options.repo) {
    throw new Error('缺少 owner 和 repo 参数');
  }
  // 实际推送逻辑（需要 GitHub API 调用）
}

// ==================== 内部工具 ====================

/**
 * 获取 FS 节点
 * @private
 */
function _getNode(fs, path) {
  const parts = path.split('/').filter(Boolean);
  let current = fs.root;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current.children.get(parts[i]);
  }
  return current.children.get(parts[parts.length - 1]);
}

/**
 * 读取 HEAD 指向的 ref 路径
 * @private
 */
async function _readHeadRef(fs) {
  try {
    const headNode = _getNode(fs, '.git/HEAD');
    const content = new TextDecoder().decode(headNode.content).trim();
    const match = content.match(/^ref:\s+(.+)$/);
    return match ? match[1] : 'refs/heads/main';
  } catch {
    return 'refs/heads/main';
  }
}

/**
 * 读取 index 文件
 * @private
 */
async function _readIndex(fs) {
  try {
    const node = _getNode(fs, '.git/index');
    const content = new TextDecoder().decode(node.content);
    return content.split('\n').filter(Boolean).map(line => {
      const [hash, ...pathParts] = line.split(' ');
      return { hash, path: pathParts.join(' ') };
    });
  } catch {
    return [];
  }
}

/**
 * 格式化时间戳为 Git 格式
 * @private
 */
function formatTimestamp(date) {
  const epoch = Math.floor(date.getTime() / 1000);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const minutes = String(absOffset % 60).padStart(2, '0');
  return `${epoch} ${sign}${hours}${minutes}`;
}

/**
 * 将十六进制字符串转为字节数组
 * @private
 */
function _hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * 从文件列表构建 tree 条目（支持嵌套目录）
 * @private
 */
async function _buildTreeEntries(fs, fileHashes) {
  const topEntries = new Map();

  for (const file of fileHashes) {
    const parts = file.path.split('/');
    if (parts.length === 1) {
      topEntries.set(parts[0], { name: parts[0], hash: file.hash, mode: '100644' });
    } else {
      const dirName = parts[0];
      if (!topEntries.has(dirName)) {
        // 递归构建子目录 tree
        const subFiles = fileHashes
          .filter(f => f.path.startsWith(dirName + '/'))
          .map(f => ({ ...f, path: f.path.slice(dirName.length + 1) }));
        const subEntries = await _buildTreeEntries(fs, subFiles);
        const subTreeHash = await writeTree(fs, subEntries);
        topEntries.set(dirName, { name: dirName, hash: subTreeHash, mode: '040000' });
      }
    }
  }

  return Array.from(topEntries.values());
}
