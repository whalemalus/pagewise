/**
 * KnowledgePanel — 知识库面板
 * 从 sidebar.js 提取的知识库列表、详情、搜索、批量操作等逻辑
 */

import { renderMarkdown, formatTime } from './utils.js';

export class KnowledgePanel {
  /**
   * @param {Object} deps - 依赖注入
   * @param {HTMLElement} deps.knowledgeList
   * @param {HTMLElement} deps.knowledgeDetail
   * @param {HTMLElement} deps.detailContent
   * @param {HTMLElement} deps.emptyKnowledge
   * @param {HTMLElement} deps.tagFilter
   * @param {HTMLElement} deps.searchInput
   * @param {HTMLElement} deps.batchToolbar
   * @param {HTMLElement} deps.batchFloatingBar
   * @param {HTMLElement} deps.batchCount
   * @param {HTMLElement} deps.batchFloatingCount
   * @param {HTMLElement} deps.batchSelectAll
   * @param {HTMLElement} deps.btnSelectMode
   * @param {HTMLElement} deps.btnBatchTag
   * @param {HTMLElement} deps.btnBatchDelete
   * @param {HTMLElement} deps.btnBatchExport
   * @param {HTMLElement} deps.btnBatchTagFloat
   * @param {HTMLElement} deps.btnBatchDeleteFloat
   * @param {HTMLElement} deps.btnBatchExportFloat
   * @param {HTMLElement} deps.btnBatchExit
   * @param {HTMLElement} deps.btnBack
   * @param {HTMLElement} deps.btnEdit
   * @param {HTMLElement} deps.btnDelete
   * @param {HTMLElement} deps.btnExportMd
   * @param {HTMLElement} deps.btnExportJson
   * @param {HTMLElement} deps.btnImport
   * @param {HTMLElement} deps.fileImport
   * @param {HTMLElement} deps.relatedEntries
   * @param {HTMLElement} deps.relatedList
   * @param {Object} deps.memory - MemorySystem 实例
   * @param {Function} deps.addSystemMessage
   * @param {Function} deps.showToast
   * @param {Function} deps.escapeHtml
   * @param {Function} deps.downloadFile
   * @param {Function} deps.getSearchMode - 获取当前搜索模式 ('keyword' | 'semantic')
   */
  constructor({
    knowledgeList, knowledgeDetail, detailContent, emptyKnowledge,
    tagFilter, searchInput,
    batchToolbar, batchFloatingBar, batchCount, batchFloatingCount,
    batchSelectAll, btnSelectMode,
    btnBatchTag, btnBatchDelete, btnBatchExport,
    btnBatchTagFloat, btnBatchDeleteFloat, btnBatchExportFloat, btnBatchExit,
    btnBack, btnEdit, btnDelete, btnExportMd, btnExportJson,
    btnImport, fileImport,
    relatedEntries, relatedList,
    memory, addSystemMessage, showToast, escapeHtml, downloadFile,
    getSearchMode
  }) {
    // DOM elements
    this.knowledgeList = knowledgeList;
    this.knowledgeDetail = knowledgeDetail;
    this.detailContent = detailContent;
    this.emptyKnowledge = emptyKnowledge;
    this.tagFilter = tagFilter;
    this.searchInput = searchInput;
    this.batchToolbar = batchToolbar;
    this.batchFloatingBar = batchFloatingBar;
    this.batchCount = batchCount;
    this.batchFloatingCount = batchFloatingCount;
    this.batchSelectAll = batchSelectAll;
    this.btnSelectMode = btnSelectMode;
    this.btnBatchTag = btnBatchTag;
    this.btnBatchDelete = btnBatchDelete;
    this.btnBatchExport = btnBatchExport;
    this.btnBatchTagFloat = btnBatchTagFloat;
    this.btnBatchDeleteFloat = btnBatchDeleteFloat;
    this.btnBatchExportFloat = btnBatchExportFloat;
    this.btnBatchExit = btnBatchExit;
    this.btnBack = btnBack;
    this.btnEdit = btnEdit;
    this.btnDelete = btnDelete;
    this.btnExportMd = btnExportMd;
    this.btnExportJson = btnExportJson;
    this.btnImport = btnImport;
    this.fileImport = fileImport;
    this.relatedEntries = relatedEntries;
    this.relatedList = relatedList;

    // Dependencies
    this.memory = memory;
    this.addSystemMessage = addSystemMessage;
    this.showToast = showToast;
    this.escapeHtml = escapeHtml;
    this.downloadFile = downloadFile;
    this._getSearchMode = getSearchMode;

    // State
    this.selectedEntryId = null;
    this.activeTag = null;
    this.selectMode = false;
    this.selectedIds = new Set();

    // Pagination state
    this._pageSize = 20;
    this._currentPage = 0;
    this._allFilteredEntries = [];
    this._isLoadingMore = false;
    this._hasMoreEntries = true;
    this._loadMoreObserver = null;
    this._currentEntries = [];
    this._searchMode = null;
    this._searchQuery = null;
    this._allSemanticResults = null;
  }

  // ==================== 知识库列表 ====================

  async loadKnowledgeList() {
    const entries = await this.memory.getAllEntries(10000);
    if (entries.length === 0) {
      this.emptyKnowledge.classList.remove('hidden');
      this.knowledgeList.innerHTML = '';
      this.knowledgeList.appendChild(this.emptyKnowledge);
      this._allFilteredEntries = [];
      this._hasMoreEntries = false;
      return;
    }
    this.emptyKnowledge.classList.add('hidden');

    // 按标签过滤
    const filtered = this.activeTag
      ? entries.filter(e => e.tags?.includes(this.activeTag))
      : entries;

    // 分页重置
    this._allFilteredEntries = filtered;
    this._currentPage = 0;
    this._hasMoreEntries = true;

    // 仅渲染第一页
    this.knowledgeList.innerHTML = '';
    this.appendKnowledgePage();
    this.setupInfiniteScroll();
  }

  showKnowledgeList() {
    this.knowledgeDetail.classList.add('hidden');
    this.knowledgeList.classList.remove('hidden');
    this.selectedEntryId = null;
    this.loadKnowledgeList();
  }

  // ==================== 分页加载 ====================

  /**
   * 追加下一页知识条目（分页加载）
   */
  appendKnowledgePage() {
    if (this._isLoadingMore || !this._hasMoreEntries) return;
    this._isLoadingMore = true;

    const start = this._currentPage * this._pageSize;
    const end = start + this._pageSize;
    const pageEntries = this._allFilteredEntries.slice(start, end);

    if (pageEntries.length === 0) {
      this._hasMoreEntries = false;
      this._isLoadingMore = false;
      return;
    }

    this._currentPage++;
    this._hasMoreEntries = end < this._allFilteredEntries.length;

    // 保存当前过滤后的条目用于批量操作
    this._currentEntries = this._allFilteredEntries.slice(0, end);

    if (this.selectMode) {
      this.knowledgeList.classList.add('select-mode');
    } else {
      this.knowledgeList.classList.remove('select-mode');
    }

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = pageEntries.map(entry => `
      <div class="knowledge-item ${this.selectedIds.has(entry.id) ? 'selected' : ''}" data-id="${entry.id}">
        <div class="knowledge-item-checkbox">
          <input type="checkbox" data-id="${entry.id}" ${this.selectedIds.has(entry.id) ? 'checked' : ''}>
        </div>
        <div class="knowledge-item-content">
          <div class="knowledge-item-title">${this.escapeHtml(entry.title)}</div>
          <div class="knowledge-item-summary">${this.escapeHtml(entry.summary || entry.question || '')}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
    this.knowledgeList.appendChild(fragment);

    // 绑定点击事件（仅绑定新添加的条目）
    this.knowledgeList.querySelectorAll('.knowledge-item:not([data-bound])').forEach(item => {
      item.setAttribute('data-bound', '1');
      item.addEventListener('click', (e) => {
        if (this.selectMode) {
          const checkbox = item.querySelector('input[type="checkbox"]');
          const id = parseInt(item.dataset.id);
          if (e.target.type === 'checkbox') {
            if (e.target.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          } else {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          }
          item.classList.toggle('selected', this.selectedIds.has(id));
          this.updateBatchCount();
        } else {
          this.showKnowledgeDetail(parseInt(item.dataset.id));
        }
      });
    });

    this._isLoadingMore = false;
  }

  /**
   * 设置无限滚动（IntersectionObserver）
   */
  setupInfiniteScroll() {
    // 清除旧的 observer
    if (this._loadMoreObserver) {
      this._loadMoreObserver.disconnect();
      this._loadMoreObserver = null;
    }

    // 移除旧的 sentinel
    const oldSentinel = document.getElementById('loadMoreSentinel');
    if (oldSentinel) oldSentinel.remove();

    if (!this._hasMoreEntries) return;

    // 创建 sentinel 元素
    const sentinel = document.createElement('div');
    sentinel.id = 'loadMoreSentinel';
    sentinel.style.height = '1px';
    sentinel.style.width = '100%';
    this.knowledgeList.appendChild(sentinel);

   this._loadMoreObserver = new IntersectionObserver((entries) => {
     for (const entry of entries) {
       if (entry.isIntersecting && this._hasMoreEntries && !this._isLoadingMore) {
          if (this._searchMode === 'semantic') {
            this.appendSearchPage();
          } else {
            this.appendKnowledgePage();
          }
        }
      }
    }, { root: this.knowledgeList.parentElement, threshold: 0.1 });

    this._loadMoreObserver.observe(sentinel);
  }

  // ==================== 渲染 ====================

  renderKnowledgeList(entries) {
    const filtered = this.activeTag
      ? entries.filter(e => e.tags?.includes(this.activeTag))
      : entries;

    // 保存当前过滤后的条目用于批量操作
    this._currentEntries = filtered;

    if (this.selectMode) {
      this.knowledgeList.classList.add('select-mode');
    } else {
      this.knowledgeList.classList.remove('select-mode');
    }

    this.knowledgeList.innerHTML = filtered.map(entry => `
      <div class="knowledge-item ${this.selectedIds.has(entry.id) ? 'selected' : ''}" data-id="${entry.id}">
        <div class="knowledge-item-checkbox">
          <input type="checkbox" data-id="${entry.id}" ${this.selectedIds.has(entry.id) ? 'checked' : ''}>
        </div>
        <div class="knowledge-item-content">
          <div class="knowledge-item-title">${this.escapeHtml(entry.title)}</div>
          <div class="knowledge-item-summary">${this.escapeHtml(entry.summary || entry.question || '')}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    this.knowledgeList.querySelectorAll('.knowledge-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (this.selectMode) {
          // 选择模式下，点击切换选中状态
          const checkbox = item.querySelector('input[type="checkbox"]');
          const id = parseInt(item.dataset.id);
          if (e.target.type === 'checkbox') {
            // 直接点击复选框
            if (e.target.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          } else {
            // 点击条目，切换复选框
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) {
              this.selectedIds.add(id);
            } else {
              this.selectedIds.delete(id);
            }
          }
          item.classList.toggle('selected', this.selectedIds.has(id));
         this.updateBatchCount();
       } else {
         this.showKnowledgeDetail(parseInt(item.dataset.id));
       }
     });
   });
 }

  /**
   * 渲染语义搜索结果（带匹配分数和高亮）
   */
  renderSemanticResults(results, query) {
    const filtered = this.activeTag
      ? results.filter(r => r.entry.tags?.includes(this.activeTag))
      : results;

    this.knowledgeList.innerHTML = filtered.map(result => {
      const entry = result.entry;
      const percent = Math.round(result.score * 100);
      const matchType = result.matchType || 'semantic';

      // 高亮标题
      const titleHtml = this.highlightText(entry.title || '', query);
      const summaryText = entry.summary || entry.question || '';
      const summaryHtml = this.highlightText(summaryText, query);

      return `
        <div class="knowledge-item" data-id="${entry.id}">
          <div class="knowledge-item-header">
            <div class="knowledge-item-title">${titleHtml}</div>
            <div class="search-score-badge ${matchType}">${percent}%</div>
          </div>
          <div class="knowledge-item-summary">${summaryHtml}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <span class="search-match-type">${matchType === 'keyword' ? '🔤 关键词' : '🧠 语义'}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.knowledgeList.querySelectorAll('.knowledge-item').forEach(item => {
      item.addEventListener('click', () => this.showKnowledgeDetail(parseInt(item.dataset.id)));
    });
  }

  /**
   * 高亮文本中匹配 query 的部分
   */
  highlightText(text, query) {
    if (!text || !query) return this.escapeHtml(text || '');
    const escaped = this.escapeHtml(text);
    const escapedQuery = this.escapeHtml(query);
    // 不区分大小写的替换
    const regex = new RegExp(escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$&</mark>');
  }

  /**
   * 追加下一页语义搜索结果（带匹配分数和高亮）
   */
  appendSearchPage() {
    if (this._isLoadingMore || !this._hasMoreEntries) return;
    this._isLoadingMore = true;

    const start = this._currentPage * this._pageSize;
    const end = start + this._pageSize;
    const pageResults = (this._allSemanticResults || []).slice(start, end);

    if (pageResults.length === 0) {
      this._hasMoreEntries = false;
      this._isLoadingMore = false;
      return;
    }

    this._currentPage++;
    this._hasMoreEntries = end < (this._allSemanticResults || []).length;

    // 保存当前过滤后的条目用于批量操作
    this._currentEntries = (this._allSemanticResults || []).slice(0, end).map(r => r.entry);

    const query = this._searchQuery || '';
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = pageResults.map(result => {
      const entry = result.entry;
      const percent = Math.round(result.score * 100);
      const matchType = result.matchType || 'semantic';
      const titleHtml = this.highlightText(entry.title || '', query);
      const summaryText = entry.summary || entry.question || '';
      const summaryHtml = this.highlightText(summaryText, query);

      return `
        <div class="knowledge-item" data-id="${entry.id}">
          <div class="knowledge-item-header">
            <div class="knowledge-item-title">${titleHtml}</div>
            <div class="search-score-badge ${matchType}">${percent}%</div>
          </div>
          <div class="knowledge-item-summary">${summaryHtml}</div>
          <div class="knowledge-item-meta">
            <span>${formatTime(entry.createdAt)}</span>
            <span class="search-match-type">${matchType === 'keyword' ? '🔤 关键词' : '🧠 语义'}</span>
            <div class="knowledge-item-tags">
              ${(entry.tags || []).map(t => `<span class="knowledge-item-tag">${this.escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');

    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
    this.knowledgeList.appendChild(fragment);

    // 绑定点击事件
    this.knowledgeList.querySelectorAll('.knowledge-item:not([data-bound])').forEach(item => {
      item.setAttribute('data-bound', '1');
      item.addEventListener('click', () => this.showKnowledgeDetail(parseInt(item.dataset.id)));
    });

    this._isLoadingMore = false;
  }

  // ==================== 搜索 ====================

  async searchKnowledge() {
    const query = this.searchInput.value.trim();
    if (!query) {
      this._searchMode = null;
      this._searchQuery = null;
      this.loadKnowledgeList();
      return;
    }

    this._searchQuery = query;

    if (this._getSearchMode() === 'semantic') {
      // 语义搜索 + 综合搜索
      const results = await this.memory.kb.combinedSearch(query, 1000);
      if (results.length === 0) {
        this.renderNoResults(query);
      } else {
        this._searchMode = 'semantic';
        // 按标签过滤
        const filtered = this.activeTag
          ? results.filter(r => r.entry.tags?.includes(this.activeTag))
          : results;
        // 分页重置
        this._allFilteredEntries = filtered.map(r => r.entry);
        this._allSemanticResults = filtered;
        this._currentPage = 0;
        this._hasMoreEntries = true;
        this.knowledgeList.innerHTML = '';
        this.appendSearchPage();
        this.setupInfiniteScroll();
      }
    } else {
      // 关键词搜索（原有逻辑）
      const results = await this.memory.kb.search(query);
      if (results.length === 0) {
        this.renderNoResults(query);
      } else {
        this._searchMode = 'keyword';
        const filtered = this.activeTag
          ? results.filter(e => e.tags?.includes(this.activeTag))
          : results;
        this._allFilteredEntries = filtered;
        this._allSemanticResults = null;
        this._currentPage = 0;
        this._hasMoreEntries = true;
        this.knowledgeList.innerHTML = '';
        this.appendKnowledgePage();
        this.setupInfiniteScroll();
      }
    }
  }

  /**
   * 渲染无结果页面（显示推荐搜索词）
   */
  async renderNoResults(query) {
    const KB = this.memory.kb.constructor;
    const allEntries = await this.memory.kb.getAllEntries(500);
    const suggestions = KB.getSearchSuggestions(query, allEntries, 3);

    let html = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>未找到匹配「${this.escapeHtml(query)}」的知识条目</p>
    `;

    if (suggestions.length > 0) {
      html += `<p class="search-suggestions-label">你是否想搜：</p>`;
      html += `<div class="search-suggestions">`;
      for (const suggestion of suggestions) {
        html += `<button class="search-suggestion-btn" data-query="${this.escapeHtml(suggestion)}">${this.escapeHtml(suggestion)}</button>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    this.knowledgeList.innerHTML = html;

    // 绑定推荐按钮事件
    this.knowledgeList.querySelectorAll('.search-suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.searchInput.value = btn.dataset.query;
        this.searchKnowledge();
      });
    });
  }

  // ==================== 标签 ====================

  async loadKnowledgeTags() {
    const tags = await this.memory.getAllTags();
    this.renderTagFilter(tags);
  }

  renderTagFilter(tags) {
    if (tags.length === 0) {
      this.tagFilter.innerHTML = '';
      return;
    }
    this.tagFilter.innerHTML = `
      <span class="tag-chip ${!this.activeTag ? 'active' : ''}" data-tag="">全部</span>
      ${tags.slice(0, 15).map(t =>
        `<span class="tag-chip ${this.activeTag === t.tag ? 'active' : ''}" data-tag="${this.escapeHtml(t.tag)}">${this.escapeHtml(t.tag)} (${t.count})</span>`
      ).join('')}
    `;
    this.tagFilter.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeTag = chip.dataset.tag || null;
        this.loadKnowledgeList();
        this.loadKnowledgeTags();
      });
    });
  }

  // ==================== 详情 ====================

  async showKnowledgeDetail(id) {
    const entry = await this.memory.getEntry(id);
   if (!entry) return;

    this.selectedEntryId = id;
    this.knowledgeList.classList.add('hidden');
    this.knowledgeDetail.classList.remove('hidden');

    this.detailContent.innerHTML = `
      <h2>${this.escapeHtml(entry.title)}</h2>
      <div class="meta">
        <div>来源：${this.escapeHtml(entry.sourceTitle || entry.sourceUrl)}</div>
        <div>时间：${formatTime(entry.createdAt)}</div>
        <div>标签：${(entry.tags || []).join(', ')}</div>
        <div>分类：${entry.category}</div>
      </div>
      ${entry.question ? `<div class="section"><div class="section-title">问题</div><div class="section-body">${this.escapeHtml(entry.question)}</div></div>` : ''}
      ${entry.answer ? `<div class="section"><div class="section-title">回答</div><div class="section-body">${renderMarkdown(entry.answer)}</div></div>` : ''}
      ${entry.summary ? `<div class="section"><div class="section-title">摘要</div><div class="section-body">${this.escapeHtml(entry.summary)}</div></div>` : ''}
      ${entry.content ? `<div class="section"><div class="section-title">原始内容</div><div class="section-body" style="max-height:200px;overflow-y:auto;font-size:12px;color:var(--text-secondary);">${this.escapeHtml(entry.content.slice(0, 2000))}</div></div>` : ''}
    `;

    // 加载并展示相关知识
    this.loadRelatedEntries(id);
  }

  /**
   * 加载并渲染与当前条目相关的知识
   */
  async loadRelatedEntries(entryId) {
    if (!this.relatedEntries || !this.relatedList) return;

    try {
      const related = await this.memory.kb.findRelatedEntries(entryId, 5);

      if (related.length === 0) {
        this.relatedEntries.classList.add('hidden');
        return;
      }

      this.relatedEntries.classList.remove('hidden');
      this.relatedList.innerHTML = related.map(({ entry, score }) => {
        const percent = Math.round(score * 100);
        const summary = entry.summary
          ? this.escapeHtml(entry.summary.slice(0, 80)) + (entry.summary.length > 80 ? '...' : '')
          : '';
        return `
          <div class="related-card" data-id="${entry.id}">
            <div class="related-card-header">
              <span class="related-card-title">${this.escapeHtml(entry.title)}</span>
              <span class="related-card-score">${percent}%</span>
            </div>
            ${summary ? `<div class="related-card-summary">${summary}</div>` : ''}
          </div>
        `;
      }).join('');

      // 绑定点击事件
      this.relatedList.querySelectorAll('.related-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = parseInt(card.dataset.id);
          this.showKnowledgeDetail(id);
        });
      });
    } catch (e) {
      // 关联加载失败不阻塞详情展示
      this.relatedEntries.classList.add('hidden');
    }
  }

  // ==================== 删除 ====================

  async deleteEntry() {
    if (!this.selectedEntryId) return;
    if (!confirm('确定删除这条知识？')) return;
    await this.memory.deleteEntry(this.selectedEntryId);
    this.addSystemMessage('已删除');
    this.loadKnowledgeList();
    this.loadKnowledgeTags();
  }

  // ==================== 批量操作 ====================

  /**
   * 进入/退出选择模式
   */
  toggleSelectMode() {
    this.selectMode = !this.selectMode;
    this.selectedIds.clear();

    // 切换工具栏显示
    this.batchToolbar.classList.toggle('hidden', !this.selectMode);
    this.batchFloatingBar.classList.toggle('hidden', !this.selectMode);

    // 更新按钮文本
    if (this.btnSelectMode) {
      this.btnSelectMode.textContent = this.selectMode ? '✖️ 取消选择' : '☑️ 选择模式';
    }

    // 重置全选复选框
    if (this.batchSelectAll) {
      this.batchSelectAll.checked = false;
    }

    // 更新计数
    this.updateBatchCount();

    // 重新渲染列表
    this.loadKnowledgeList();
  }

  /**
   * 全选/取消全选
   */
  toggleSelectAll() {
    const isChecked = this.batchSelectAll.checked;
    const items = this.knowledgeList.querySelectorAll('.knowledge-item');

    items.forEach(item => {
      const id = parseInt(item.dataset.id);
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (isChecked) {
        this.selectedIds.add(id);
        if (checkbox) checkbox.checked = true;
        item.classList.add('selected');
      } else {
        this.selectedIds.delete(id);
        if (checkbox) checkbox.checked = false;
        item.classList.remove('selected');
      }
    });

    this.updateBatchCount();
  }

  /**
   * 更新批量操作选中计数
   */
  updateBatchCount() {
    const count = this.selectedIds.size;
    const text = `已选 ${count} 条`;
    if (this.batchCount) this.batchCount.textContent = text;
    if (this.batchFloatingCount) this.batchFloatingCount.textContent = text;
  }

  /**
   * 批量删除
   */
  async batchDelete() {
    if (this.selectedIds.size === 0) {
      this.showToast('请先选择要删除的条目', 'warning');
      return;
    }

    const count = this.selectedIds.size;
    if (!confirm(`确定要删除选中的 ${count} 条知识条目吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const ids = Array.from(this.selectedIds);
      const deleted = await this.memory.kb.batchDelete(ids);
      this.showToast(`成功删除 ${deleted} 条知识条目`);
      this.toggleSelectMode();
      this.loadKnowledgeTags();
    } catch (error) {
      this.showToast(`批量删除失败：${error.message}`, 'error');
    }
  }

  /**
   * 批量打标签
   */
  async batchTag() {
    if (this.selectedIds.size === 0) {
      this.showToast('请先选择要打标签的条目', 'warning');
      return;
    }

    const tag = prompt('请输入要添加的标签：');
    if (!tag || !tag.trim()) return;

    try {
      const ids = Array.from(this.selectedIds);
      const updated = await this.memory.kb.batchAddTag(ids, tag.trim());
      this.showToast(`成功为 ${updated} 条知识添加标签「${tag.trim()}」`);
      this.toggleSelectMode();
      this.loadKnowledgeTags();
    } catch (error) {
      this.showToast(`批量打标签失败：${error.message}`, 'error');
    }
  }

  /**
   * 批量导出
   */
  batchExport() {
    if (this.selectedIds.size === 0) {
      this.showToast('请先选择要导出的条目', 'warning');
      return;
    }

    // 从当前渲染的条目中过滤选中的
    const entries = (this._currentEntries || []).filter(e => this.selectedIds.has(e.id));
    if (entries.length === 0) {
      this.showToast('没有找到选中的条目', 'warning');
      return;
    }

    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagewise-batch-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast(`已导出 ${entries.length} 条知识条目`);
  }

  // ==================== 导出 ====================

  async exportMarkdown() {
    const md = await this.memory.exportMarkdown();
    this.downloadFile(md, 'knowledge-base.md', 'text/markdown');
  }

  async exportJson() {
    const json = await this.memory.exportJSON();
    this.downloadFile(json, 'knowledge-base.json', 'application/json');
  }
}
