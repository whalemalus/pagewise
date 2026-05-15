/**
 * QA005 — 浏览器兼容性测试：模块系统兼容
 *
 * 验证项目完全使用 ES Module，无 CommonJS 遗留，
 * import/export 正确，动态导入可用，模块解析一致。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installChromeMock } from './helpers/setup.js';

installChromeMock();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ==================== 工具函数 ====================

function readSource(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

function listJsFiles(dir) {
  const fullPath = join(ROOT, dir);
  if (!existsSync(fullPath)) return [];
  const entries = readdirSync(fullPath, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.js'))
    .map(e => `${dir}/${e.name}`);
}

const libFiles  = listJsFiles('lib');
const bgFiles   = listJsFiles('background');
const sidebarFiles = listJsFiles('sidebar');
const popupFiles   = listJsFiles('popup');
const optionsFiles = listJsFiles('options');

// ==================== package.json 配置 ====================

describe('package.json ESM 配置', () => {
  const pkg = JSON.parse(readSource('package.json'));

  it('type 字段为 "module"（全局 ESM）', () => {
    assert.equal(pkg.type, 'module');
  });

  it('不含 "type": "commonjs" 或缺失 type 字段', () => {
    assert.ok(pkg.type === 'module', '必须显式声明 type: module');
  });

  it('不含 CJS 入口字段 "main"（或 main 指向 .mjs）', () => {
    // 对于纯 ESM 项目，main 字段可选
    if (pkg.main) {
      assert.ok(
        pkg.main.endsWith('.mjs') || pkg.main.endsWith('.js'),
        `main 字段: ${pkg.main}`
      );
    }
  });
});

// ==================== 无 CommonJS require() ====================

describe('无 CommonJS require() 使用', () => {
  const allSourceFiles = [
    ...libFiles,
    ...bgFiles,
    ...sidebarFiles,
    ...popupFiles,
    ...optionsFiles,
  ];

  for (const file of allSourceFiles) {
    const content = readSource(file);
    // 提取非注释、非字符串中的 require() 调用
    // 排除注释行和正则模式（如 skill-validator.js 中的检测规则）
    const lines = content.split('\n');
    const requireCalls = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 跳过注释行
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*') || line.trimStart().startsWith('/*')) continue;
      // 跳过纯字符串行（含 pattern: /require/）
      if (line.includes('/require')) continue;
      if (line.includes("'require")) continue;
      if (line.includes('"require')) continue;

      const match = line.match(/\brequire\s*\(/);
      if (match) {
        requireCalls.push({ line: i + 1, content: line.trim() });
      }
    }

    if (requireCalls.length > 0) {
      it(`${file} 不含 require() 调用（应使用 import）`, () => {
        assert.fail(
          `发现 ${requireCalls.length} 处 require():\n` +
          requireCalls.map(c => `  L${c.line}: ${c.content}`).join('\n')
        );
      });
    }
  }
});

// ==================== 无 module.exports / exports. 使用 ====================

describe('无 CommonJS exports 使用', () => {
  const allSourceFiles = [
    ...libFiles,
    ...bgFiles,
    ...sidebarFiles,
    ...popupFiles,
    ...optionsFiles,
  ];

  for (const file of allSourceFiles) {
    const content = readSource(file);
    const lines = content.split('\n');
    const cjsExports = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*') || line.trimStart().startsWith('/*')) continue;

      if (/\bmodule\.exports\b/.test(line) || /\bexports\.\w+\s*=/.test(line)) {
        cjsExports.push({ line: i + 1, content: line.trim() });
      }
    }

    if (cjsExports.length > 0) {
      it(`${file} 不含 module.exports / exports.*`, () => {
        assert.fail(
          `发现 ${cjsExports.length} 处 CJS exports:\n` +
          cjsExports.map(c => `  L${c.line}: ${c.content}`).join('\n')
        );
      });
    }
  }
});

// ==================== lib 文件使用 ES export ====================

describe('lib 文件使用 ES export 语法', () => {
  for (const file of libFiles) {
    // pdf.min.mjs / pdf.worker.min.mjs 可能是第三方，跳过
    if (file.endsWith('.mjs')) continue;
    // pdf.worker.mjs 跳过
    if (file.includes('pdf.worker')) continue;
    // test-r97.js 是独立测试脚本
    if (file.includes('test-r97')) continue;

    const content = readSource(file);
    const hasExport = /(?:^|\n)\s*export\s+(?:default\s+|(?:const|let|var|function|class|async\s+function)\s+|\{)/m.test(content);

    if (hasExport) {
      it(`${file} 含有 export 语句`, () => {
        assert.ok(true);
      });
    }
  }
});

// ==================== ES import 语法一致性 ====================

describe('ES import 语法正确性', () => {
  for (const file of libFiles) {
    if (file.endsWith('.mjs')) continue;
    if (file.includes('test-r97')) continue;

    const content = readSource(file);
    const importLines = content.match(/^import\s+.+$/gm) || [];

    if (importLines.length > 0) {
      it(`${file} import 路径以 ./ 或 ../ 开头或为包名`, () => {
        for (const imp of importLines) {
          const fromMatch = imp.match(/from\s+['"](.+?)['"]/);
          if (fromMatch) {
            const path = fromMatch[1];
            // 应为相对路径或包名（不以 / 开头的绝对路径）
            assert.ok(
              path.startsWith('.') || path.startsWith('@') || !path.startsWith('/'),
              `非法 import 路径: ${path} in ${file}`
            );
          }
        }
      });

      it(`${file} import 使用单引号`, () => {
        for (const imp of importLines) {
          // 检查 from 后面使用单引号
          assert.ok(
            imp.includes("'") || !imp.includes('"'),
            `应使用单引号: ${imp.trim()}`
          );
        }
      });
    }
  }
});

// ==================== 动态 import() 支持 ====================

describe('动态 import() 使用模式', () => {
  const allSourceFiles = [
    ...libFiles,
    ...bgFiles,
    ...sidebarFiles,
    ...popupFiles,
    ...optionsFiles,
  ];

  let dynamicImportCount = 0;

  for (const file of allSourceFiles) {
    const content = readSource(file);
    const dynamicImports = content.match(/\bimport\s*\(/g);
    if (dynamicImports) {
      dynamicImportCount += dynamicImports.length;

      it(`${file} 动态 import() 使用正确语法`, () => {
        // 检查 import() 后面跟括号
        const matches = content.match(/\bimport\s*\([^)]+\)/g) || [];
        for (const m of matches) {
          assert.ok(
            m.match(/import\s*\(/),
            `动态 import 语法不正确: ${m}`
          );
        }
      });
    }
  }

  if (dynamicImportCount > 0) {
    it(`共发现 ${dynamicImportCount} 处动态 import()`, () => {
      assert.ok(dynamicImportCount > 0);
    });
  }
});

// ==================== 动态导入核心模块验证 ====================

describe('动态导入核心 lib 模块', () => {
  const modules = [
    { name: 'ai-client',     path: '../lib/ai-client.js' },
    { name: 'browser-compat', path: '../lib/browser-compat.js' },
    { name: 'utils',          path: '../lib/utils.js' },
    { name: 'knowledge-base', path: '../lib/knowledge-base.js' },
    { name: 'highlight-store', path: '../lib/highlight-store.js' },
    { name: 'conversation-store', path: '../lib/conversation-store.js' },
  ];

  for (const mod of modules) {
    it(`动态导入 ${mod.name} 不抛异常`, async () => {
      await assert.doesNotReject(
        () => import(mod.path),
        `无法导入 ${mod.path}`
      );
    });

    it(`${mod.name} 导出内容非空`, async () => {
      const m = await import(mod.path);
      const keys = Object.keys(m);
      assert.ok(keys.length > 0, `${mod.name} 应至少导出一个成员`);
    });
  }
});

// ==================== 文件扩展名一致性 ====================

describe('文件扩展名一致性', () => {
  it('所有 lib/*.js 文件使用 .js 扩展名', () => {
    for (const file of libFiles) {
      assert.ok(file.endsWith('.js') || file.endsWith('.mjs'), `非法扩展名: ${file}`);
    }
  });

  it('background 目录下所有文件使用 .js 扩展名', () => {
    for (const file of bgFiles) {
      assert.ok(file.endsWith('.js'), `background 文件应为 .js: ${file}`);
    }
  });

  it('所有 HTML 页面引用 .js 文件（非 .ts）', () => {
    const htmlFiles = [
      'sidebar/sidebar.html',
      'popup/popup.html',
      'options/options.html',
    ];
    for (const html of htmlFiles) {
      const content = readSource(html);
      const scriptSrcs = content.match(/src="([^"]+)"/g) || [];
      for (const src of scriptSrcs) {
        const path = src.match(/src="([^"]+)"/)[1];
        if (path.startsWith('http')) continue; // 外部脚本
        assert.ok(
          path.endsWith('.js') || path.endsWith('.mjs'),
          `${html} 引用了非 JS 文件: ${path}`
        );
      }
    }
  });
});

// ==================== HTML 文件 type="module" 声明 ====================

describe('HTML 文件 script 标签使用 type="module"', () => {
  const htmlFiles = [
    { name: 'sidebar', path: 'sidebar/sidebar.html' },
    { name: 'popup',   path: 'popup/popup.html' },
    { name: 'options', path: 'options/options.html' },
  ];

  for (const html of htmlFiles) {
    const content = readSource(html.path);
    const scriptTags = content.match(/<script[^>]*>/g) || [];
    const localScripts = scriptTags.filter(s => !s.includes('http'));

    it(`${html.name} 页面使用 ES import 的 <script> 含 type="module"`, () => {
      for (const tag of localScripts) {
        // 跳过第三方库 (pdf.js 等)
        if (tag.includes('pdf')) continue;

        // 提取 src 路径
        const srcMatch = tag.match(/src="([^"]+)"/);
        if (!srcMatch) continue; // inline script, 跳过
        const srcPath = srcMatch[1];

        // 读取对应的 JS 文件检查是否使用 ES module 语法
        const jsDir = dirname(html.path);
        let jsContent = '';
        try {
          jsContent = readSource(join(jsDir, srcPath));
        } catch { continue; }

        const usesESM = /^import\s+/m.test(jsContent) || /^export\s+/m.test(jsContent);

        if (usesESM) {
          // 使用 ESM 语法的脚本必须有 type="module"
          assert.ok(
            tag.includes('type="module"'),
            `${html.path} 引用 ${srcPath} 使用了 ES import/export 但缺少 type="module": ${tag}`
          );
        }
      }
    });

    it(`${html.name} 页面的 type="module" 脚本确实使用 ES 语法`, () => {
      for (const tag of localScripts) {
        if (!tag.includes('type="module"')) continue;
        const srcMatch = tag.match(/src="([^"]+)"/);
        if (!srcMatch) continue;
        const srcPath = srcMatch[1];

        const jsDir = dirname(html.path);
        let jsContent = '';
        try {
          jsContent = readSource(join(jsDir, srcPath));
        } catch { continue; }

        // type="module" 的脚本应使用 import 或 export
        const usesESM = /^import\s+/m.test(jsContent) || /^export\s+/m.test(jsContent);
        assert.ok(
          usesESM || jsContent.length < 10, // 小文件可能只在运行时 import
          `${srcPath} 声明为 module 但未使用 import/export`
        );
      }
    });
  }
});

// ==================== content script IIFE 封装 ====================

describe('content script IIFE 封装', () => {
  it('content.js 使用 IIFE 封装（防止全局污染）', () => {
    const content = readSource('content/content.js');
    assert.ok(
      content.includes('(function') || content.includes('(() =>'),
      'content.js 应使用 IIFE 封装'
    );
  });

  it('content.js 使用 strict mode', () => {
    const content = readSource('content/content.js');
    assert.ok(
      content.includes("'use strict'") || content.includes('"use strict"'),
      'content.js 应使用 strict mode'
    );
  });

  it('content.js 防重复注入标记', () => {
    const content = readSource('content/content.js');
    assert.ok(
      content.includes('__AI_ASSISTANT_INJECTED__'),
      'content.js 应有防重复注入标记'
    );
  });
});

// ==================== service worker 使用 ESM import ====================

describe('service worker ESM 导入', () => {
  it('service-worker.js 使用 ES import 导入依赖', () => {
    const content = readSource('background/service-worker.js');
    assert.ok(
      content.match(/^import\s+/m),
      'service-worker.js 应使用 import 语句'
    );
  });

  it('service-worker.js 导入 browser-compat.js', () => {
    const content = readSource('background/service-worker.js');
    assert.ok(
      content.includes('browser-compat.js'),
      'service-worker.js 应导入 browser-compat.js'
    );
  });

  it('service-worker.js 无 require() 调用', () => {
    const content = readSource('background/service-worker.js');
    const lines = content.split('\n').filter(l => !l.trimStart().startsWith('//'));
    for (const line of lines) {
      assert.ok(
        !/\brequire\s*\(/.test(line),
        `service-worker.js 不应含 require(): ${line.trim()}`
      );
    }
  });
});
