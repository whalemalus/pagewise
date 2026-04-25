/**
 * Options - 设置页面逻辑
 */

import { KnowledgeBase } from '../lib/knowledge-base.js';
import { AIClient } from '../lib/ai-client.js';
import { getSettings, saveSettings } from '../lib/utils.js';

const kb = new KnowledgeBase();

document.addEventListener('DOMContentLoaded', async () => {
  // 加载当前设置
  const settings = await getSettings();

  document.getElementById('apiProtocol').value = settings.apiProtocol || 'openai';
  document.getElementById('apiBaseUrl').value = settings.apiBaseUrl || 'https://api.openai.com';
  document.getElementById('apiKey').value = settings.apiKey || '';
  document.getElementById('model').value = settings.model || 'gpt-4o';
  document.getElementById('maxTokens').value = settings.maxTokens || 4096;
  document.getElementById('autoExtract').checked = settings.autoExtract || false;
  document.getElementById('autoSave').checked = settings.autoSave || false;
  document.getElementById('theme').value = settings.theme || 'light';

  // 保存设置
  document.getElementById('btnSave').addEventListener('click', async () => {
    const newSettings = {
      apiProtocol: document.getElementById('apiProtocol').value,
      apiBaseUrl: document.getElementById('apiBaseUrl').value.trim().replace(/\/+$/, ''),
      apiKey: document.getElementById('apiKey').value.trim(),
      model: document.getElementById('model').value.trim(),
      maxTokens: parseInt(document.getElementById('maxTokens').value),
      autoExtract: document.getElementById('autoExtract').checked,
      autoSave: document.getElementById('autoSave').checked,
      theme: document.getElementById('theme').value
    };

    await saveSettings(newSettings);

    const status = document.getElementById('saveStatus');
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 2000);
  });

  // 测试连接
  document.getElementById('btnTestConnection').addEventListener('click', async () => {
    const protocol = document.getElementById('apiProtocol').value;
    const baseUrl = document.getElementById('apiBaseUrl').value.trim().replace(/\/+$/, '');
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value.trim();
    const testResult = document.getElementById('testResult');
    const btn = document.getElementById('btnTestConnection');

    if (!apiKey) {
      showTestResult(false, '请先填写 API Key');
      return;
    }

    btn.disabled = true;
    btn.textContent = '测试中...';
    testResult.classList.add('hidden');

    const client = new AIClient({
      apiKey, baseUrl,
      model: model || 'gpt-4o',
      protocol
    });
    const result = await client.testConnection();

    btn.disabled = false;
    btn.textContent = '测试连接';

    if (result.success) {
      showTestResult(true, `${result.protocol} 协议 | 模型: ${result.model} | 响应: "${result.content}"`);
    } else {
      showTestResult(false, `${result.protocol} 协议 | ${result.error}`);
    }
  });

  // 导出 Markdown
  document.getElementById('btnExportMd').addEventListener('click', async () => {
    await kb.init();
    const md = await kb.exportMarkdown();
    downloadFile(md, 'knowledge-base.md', 'text/markdown');
  });

  // 导出 JSON
  document.getElementById('btnExportJson').addEventListener('click', async () => {
    await kb.init();
    const json = await kb.exportJSON();
    downloadFile(json, 'knowledge-base.json', 'application/json');
  });

  // 清除数据
  document.getElementById('btnClearData').addEventListener('click', async () => {
    if (!confirm('确定要清除所有知识库数据吗？此操作不可恢复。')) return;
    if (!confirm('再次确认：这将永久删除所有保存的知识条目。')) return;

    await kb.init();
    const entries = await kb.getAllEntries(100000);
    for (const entry of entries) {
      await kb.deleteEntry(entry.id);
    }
    alert('所有数据已清除');
  });
});

function showTestResult(success, message) {
  const el = document.getElementById('testResult');
  el.classList.remove('hidden', 'success', 'error');
  el.classList.add(success ? 'success' : 'error');
  el.textContent = message;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
