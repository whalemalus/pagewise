/**
 * BookmarkDarkTheme — 暗色主题管理
 *
 * 为书签图谱及所有关联面板提供统一的明暗主题色彩方案。
 * 纯 ES Module，不依赖 DOM 或 Chrome API。
 *
 * 支持:
 *   - 三种模式: 'light' | 'dark' | 'system'
 *   - 系统主题自动跟随 (prefers-color-scheme)
 *   - 手动切换明暗
 *   - 图谱专用颜色 (背景/边/标签/节点边框)
 *   - 面板通用颜色 (背景/文字/边框/输入框)
 *   - 15 色分组方案 (明暗各一)
 *   - CSS 变量生成 (可直接注入 <style>)
 *   - 主题变更回调
 */

// ==================== 主题模式常量 ====================

/** 允许的主题模式 */
export const THEME_MODES = ['light', 'dark', 'system'];

// ==================== 明亮主题色板 ====================

export const LIGHT_THEME = {
  // 全局
  background: '#ffffff',
  text: '#333333',

  // 图谱
  graph: {
    background: '#ffffff',
    edgeColor: 'rgba(150, 150, 150, 0.4)',
    edgeHighlight: 'rgba(66, 133, 244, 0.8)',
    dimmedEdge: 'rgba(200, 200, 200, 0.1)',
    labelColor: '#333333',
    nodeBorder: '#333333',
  },

  // 面板
  panel: {
    background: '#ffffff',
    border: '#e0e0e0',
    text: '#333333',
    secondaryText: '#666666',
    accent: '#4285F4',
    hoverBg: '#f5f5f5',
    inputBg: '#ffffff',
    inputBorder: '#cccccc',
  },
};

// ==================== 暗色主题色板 ====================

export const DARK_THEME = {
  // 全局
  background: '#1a1a2e',
  text: '#e0e0e0',

  // 图谱
  graph: {
    background: '#1a1a2e',
    edgeColor: 'rgba(100, 100, 140, 0.5)',
    edgeHighlight: 'rgba(100, 180, 255, 0.9)',
    dimmedEdge: 'rgba(60, 60, 80, 0.15)',
    labelColor: '#c8c8e0',
    nodeBorder: '#c8c8e0',
  },

  // 面板
  panel: {
    background: '#16213e',
    border: '#2a2a4a',
    text: '#e0e0e0',
    secondaryText: '#9999bb',
    accent: '#5b9bf5',
    hoverBg: '#1f2b47',
    inputBg: '#0f1a30',
    inputBorder: '#3a3a5a',
  },
};

// ==================== 15 色分组方案 ====================

/** 明亮主题分组颜色 (适配白色背景) */
const LIGHT_GROUP_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853', '#FF6D01',
  '#46BDC6', '#7B61FF', '#E91E63', '#00BCD4', '#8BC34A',
  '#FF9800', '#9C27B0', '#607D8B', '#795548', '#F44336',
];

/** 暗色主题分组颜色 (适配深色背景，亮度略高) */
const DARK_GROUP_COLORS = [
  '#6AADFF', '#FF6B6B', '#FFD93D', '#6BCB77', '#FF8C42',
  '#5FD4D6', '#9D8FFF', '#FF5A8A', '#26D9E8', '#A8E06C',
  '#FFB347', '#BB6BD9', '#7FAAB5', '#A08070', '#FF6B6B',
];

// ==================== BookmarkDarkTheme ====================

export class BookmarkDarkTheme {
  /**
   * @param {'light'|'dark'|'system'} [mode='system'] — 初始主题模式
   */
  constructor(mode = 'system') {
    /** @type {'light'|'dark'|'system'} */
    this._mode = THEME_MODES.includes(mode) ? mode : 'system';

    /** @type {Function[]} */
    this._listeners = [];
  }

  // ==================== 模式管理 ====================

  /**
   * 获取当前模式设置
   * @returns {'light'|'dark'|'system'}
   */
  getMode() {
    return this._mode;
  }

  /**
   * 设置主题模式
   * @param {'light'|'dark'|'system'} mode
   */
  setMode(mode) {
    if (!THEME_MODES.includes(mode)) return;
    if (mode === this._mode) return;

    this._mode = mode;
    this._notifyListeners();
  }

  /**
   * 切换明暗 (system 模式下切换为与当前相反的显式模式)
   */
  toggle() {
    const current = this.getTheme();
    this.setMode(current === 'dark' ? 'light' : 'dark');
  }

  /**
   * 获取实际生效的主题名称 (解析 system 模式)
   * @returns {'light'|'dark'}
   */
  getTheme() {
    if (this._mode === 'system') {
      return this._detectSystemTheme();
    }
    return this._mode;
  }

  // ==================== 颜色获取 ====================

  /**
   * 获取完整主题色板
   * @returns {Object}
   */
  getColors() {
    return this.getTheme() === 'dark'
      ? { ...DARK_THEME, graph: { ...DARK_THEME.graph }, panel: { ...DARK_THEME.panel } }
      : { ...LIGHT_THEME, graph: { ...LIGHT_THEME.graph }, panel: { ...LIGHT_THEME.panel } };
  }

  /**
   * 获取图谱专用颜色
   * @returns {{background:string, edgeColor:string, edgeHighlight:string, dimmedEdge:string, labelColor:string, nodeBorder:string}}
   */
  getGraphColors() {
    const colors = this.getColors();
    return { ...colors.graph };
  }

  /**
   * 获取面板通用颜色
   * @returns {{background:string, border:string, text:string, secondaryText:string, accent:string, hoverBg:string, inputBg:string, inputBorder:string}}
   */
  getPanelColors() {
    const colors = this.getColors();
    return { ...colors.panel };
  }

  /**
   * 获取 15 色分组方案 (适配当前主题)
   * @returns {string[]}
   */
  getGroupColors() {
    return this.getTheme() === 'dark'
      ? [...DARK_GROUP_COLORS]
      : [...LIGHT_GROUP_COLORS];
  }

  // ==================== CSS 变量 ====================

  /**
   * 生成 CSS 变量键值对 (可注入 <style> 或 document.documentElement)
   * @returns {Object<string, string>}
   */
  getCSSVariables() {
    const colors = this.getColors();
    return {
      // 全局
      '--bm-bg': colors.background,
      '--bm-text': colors.text,

      // 图谱
      '--bm-graph-bg': colors.graph.background,
      '--bm-graph-edge': colors.graph.edgeColor,
      '--bm-graph-edge-highlight': colors.graph.edgeHighlight,
      '--bm-graph-dimmed-edge': colors.graph.dimmedEdge,
      '--bm-graph-label': colors.graph.labelColor,
      '--bm-graph-node-border': colors.graph.nodeBorder,

      // 面板
      '--bm-panel-bg': colors.panel.background,
      '--bm-panel-border': colors.panel.border,
      '--bm-panel-text': colors.panel.text,
      '--bm-panel-secondary-text': colors.panel.secondaryText,
      '--bm-panel-accent': colors.panel.accent,
      '--bm-panel-hover-bg': colors.panel.hoverBg,
      '--bm-panel-input-bg': colors.panel.inputBg,
      '--bm-panel-input-border': colors.panel.inputBorder,
    };
  }

  // ==================== 回调 ====================

  /**
   * 注册主题变更回调
   * @param {Function} callback — (theme: 'light'|'dark', mode: string) => void
   */
  onThemeChange(callback) {
    if (typeof callback === 'function') {
      this._listeners.push(callback);
    }
  }

  /**
   * 清理所有资源
   */
  destroy() {
    this._listeners = [];
  }

  // ==================== 内部方法 ====================

  /**
   * 检测系统主题偏好
   * @returns {'light'|'dark'}
   */
  _detectSystemTheme() {
    if (typeof globalThis !== 'undefined' && typeof globalThis.matchMedia === 'function') {
      const mql = globalThis.matchMedia('(prefers-color-scheme: dark)');
      return mql && mql.matches ? 'dark' : 'light';
    }
    return 'light';
  }

  /**
   * 通知所有监听器
   */
  _notifyListeners() {
    const theme = this.getTheme();
    for (const listener of this._listeners) {
      try {
        listener(theme, this._mode);
      } catch {
        // 回调异常不应影响主题切换逻辑
      }
    }
  }
}
