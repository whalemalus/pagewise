/**
 * 测试 — 对话分支功能
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * ConversationBranchManager — 对话分支管理器
 * 从 sidebar.js 中提取的纯逻辑，方便测试
 */
class ConversationBranchManager {
  constructor() {
    this.branches = [];           // 所有分支 { id, parentId, name, messages, branchPoint, createdAt }
    this.activeBranchId = null;   // 当前活跃分支 ID，null = 主对话
    this.maxBranches = 5;
  }

  /**
   * 从指定消息位置创建分支
   * @param {Array} mainMessages - 主对话消息列表
   * @param {number} messageIndex - 分支点消息索引
   * @param {string} branchQuestion - 分支点的原始问题
   * @returns {{ success: boolean, branchId?: string, error?: string }}
   */
  createBranch(mainMessages, messageIndex, branchQuestion) {
    if (this.branches.length >= this.maxBranches) {
      return { success: false, error: '已达到最大分支数量（5 个）' };
    }

    if (messageIndex < 0 || messageIndex >= mainMessages.length) {
      return { success: false, error: '无效的消息索引' };
    }

    const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const branchName = `分支 ${this.branches.length + 1}`;

    // 保留从对话开始到当前消息的所有历史
    const branchMessages = mainMessages.slice(0, messageIndex + 1);

    const branch = {
      id: branchId,
      parentId: this.activeBranchId, // 记录从哪个对话分出来的
      name: branchName,
      messages: branchMessages,
      branchQuestion: branchQuestion,
      branchPointIndex: messageIndex,
      createdAt: new Date().toISOString()
    };

    this.branches.push(branch);
    this.activeBranchId = branchId;

    return { success: true, branchId };
  }

  /**
   * 返回主对话
   * @returns {{ previousBranchId: string|null }}
   */
  returnToMain() {
    const previousBranchId = this.activeBranchId;
    this.activeBranchId = null;
    return { previousBranchId };
  }

  /**
   * 切换到指定分支
   * @param {string} branchId
   * @returns {{ success: boolean, branch?: object, error?: string }}
   */
  switchBranch(branchId) {
    const branch = this.branches.find(b => b.id === branchId);
    if (!branch) {
      return { success: false, error: '分支不存在' };
    }
    this.activeBranchId = branchId;
    return { success: true, branch };
  }

  /**
   * 获取当前活跃分支
   * @returns {object|null}
   */
  getActiveBranch() {
    if (!this.activeBranchId) return null;
    return this.branches.find(b => b.id === this.activeBranchId) || null;
  }

  /**
   * 删除指定分支
   * @param {string} branchId
   * @returns {boolean}
   */
  deleteBranch(branchId) {
    const index = this.branches.findIndex(b => b.id === branchId);
    if (index === -1) return false;
    this.branches.splice(index, 1);
    if (this.activeBranchId === branchId) {
      this.activeBranchId = null;
    }
    return true;
  }

  /**
   * 获取分支信息用于显示
   * @returns {{ isBranched: boolean, branchName?: string, branchQuestion?: string, totalBranches: number }}
   */
  getBranchInfo() {
    const activeBranch = this.getActiveBranch();
    return {
      isBranched: activeBranch !== null,
      branchName: activeBranch?.name || null,
      branchQuestion: activeBranch?.branchQuestion || null,
      branchId: activeBranch?.id || null,
      totalBranches: this.branches.length
    };
  }

  /**
   * 检查是否在分支中
   * @returns {boolean}
   */
  isInBranch() {
    return this.activeBranchId !== null;
  }

  /**
   * 获取所有分支列表
   * @returns {Array}
   */
  getAllBranches() {
    return [...this.branches];
  }

  /**
   * 清除所有分支
   */
  clearBranches() {
    this.branches = [];
    this.activeBranchId = null;
  }
}

// ==================== 测试 ====================

describe('ConversationBranchManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ConversationBranchManager();
  });

  // 初始状态
  describe('初始状态', () => {
    it('没有活跃分支', () => {
      assert.equal(manager.activeBranchId, null);
      assert.equal(manager.isInBranch(), false);
    });

    it('分支列表为空', () => {
      assert.deepEqual(manager.branches, []);
      assert.equal(manager.branches.length, 0);
    });

    it('getBranchInfo 返回正确初始值', () => {
      const info = manager.getBranchInfo();
      assert.equal(info.isBranched, false);
      assert.equal(info.branchName, null);
      assert.equal(info.branchQuestion, null);
      assert.equal(info.totalBranches, 0);
    });
  });

  // 创建分支
  describe('createBranch()', () => {
    const messages = [
      { role: 'user', content: '什么是 React？' },
      { role: 'assistant', content: 'React 是一个 JavaScript 库...' },
      { role: 'user', content: '它和 Vue 有什么区别？' },
      { role: 'assistant', content: 'React 和 Vue 的主要区别...' }
    ];

    it('成功创建分支', () => {
      const result = manager.createBranch(messages, 1, '什么是 React？');
      assert.equal(result.success, true);
      assert.ok(result.branchId);
    });

    it('创建后进入分支状态', () => {
      manager.createBranch(messages, 1, '什么是 React？');
      assert.equal(manager.isInBranch(), true);
    });

    it('分支保留到分叉点的消息', () => {
      manager.createBranch(messages, 1, '什么是 React？');
      const branch = manager.getActiveBranch();
      assert.equal(branch.messages.length, 2); // 索引 0 和 1
      assert.equal(branch.messages[0].role, 'user');
      assert.equal(branch.messages[1].role, 'assistant');
    });

    it('分支记录分叉点问题', () => {
      manager.createBranch(messages, 1, '什么是 React？');
      const branch = manager.getActiveBranch();
      assert.equal(branch.branchQuestion, '什么是 React？');
    });

    it('超出最大分支数量返回错误', () => {
      for (let i = 0; i < 5; i++) {
        const result = manager.createBranch(messages, 1, `问题 ${i}`);
        assert.equal(result.success, true);
        // 返回主对话再创建下一个
        manager.returnToMain();
      }
      const result = manager.createBranch(messages, 1, '第六个');
      assert.equal(result.success, false);
      assert.equal(result.error, '已达到最大分支数量（5 个）');
    });

    it('无效索引返回错误', () => {
      const result1 = manager.createBranch(messages, -1, 'test');
      assert.equal(result1.success, false);
      assert.equal(result1.error, '无效的消息索引');

      const result2 = manager.createBranch(messages, 10, 'test');
      assert.equal(result2.success, false);
      assert.equal(result2.error, '无效的消息索引');
    });

    it('分支数量正确递增', () => {
      manager.createBranch(messages, 1, '问题1');
      assert.equal(manager.getBranchInfo().totalBranches, 1);

      manager.returnToMain();
      manager.createBranch(messages, 3, '问题2');
      assert.equal(manager.getBranchInfo().totalBranches, 2);
    });

    it('空消息列表边界', () => {
      const result = manager.createBranch([], 0, 'test');
      assert.equal(result.success, false);
    });

    it('单条消息可以创建分支', () => {
      const singleMsg = [{ role: 'user', content: 'hello' }];
      const result = manager.createBranch(singleMsg, 0, 'hello');
      assert.equal(result.success, true);
      const branch = manager.getActiveBranch();
      assert.equal(branch.messages.length, 1);
    });
  });

  // 返回主对话
  describe('returnToMain()', () => {
    it('返回主对话后不在分支中', () => {
      const messages = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' }
      ];
      manager.createBranch(messages, 1, 'Q1');
      assert.equal(manager.isInBranch(), true);

      manager.returnToMain();
      assert.equal(manager.isInBranch(), false);
      assert.equal(manager.activeBranchId, null);
    });

    it('记录返回前的分支 ID', () => {
      const messages = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' }
      ];
      const { branchId } = manager.createBranch(messages, 1, 'Q1');
      const result = manager.returnToMain();
      assert.equal(result.previousBranchId, branchId);
    });

    it('不在分支中时返回主对话无副作用', () => {
      const result = manager.returnToMain();
      assert.equal(result.previousBranchId, null);
      assert.equal(manager.isInBranch(), false);
    });
  });

  // 分支切换
  describe('switchBranch()', () => {
    it('切换到已存在的分支', () => {
      const messages = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' }
      ];
      const { branchId } = manager.createBranch(messages, 1, 'Q1');
      manager.returnToMain();

      const result = manager.switchBranch(branchId);
      assert.equal(result.success, true);
      assert.equal(manager.isInBranch(), true);
    });

    it('切换到不存在的分支返回错误', () => {
      const result = manager.switchBranch('nonexistent');
      assert.equal(result.success, false);
      assert.equal(result.error, '分支不存在');
    });
  });

  // 删除分支
  describe('deleteBranch()', () => {
    it('删除已存在的分支', () => {
      const messages = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' }
      ];
      const { branchId } = manager.createBranch(messages, 1, 'Q1');
      assert.equal(manager.branches.length, 1);

      const result = manager.deleteBranch(branchId);
      assert.equal(result, true);
      assert.equal(manager.branches.length, 0);
    });

    it('删除当前活跃分支后回到主对话', () => {
      const messages = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' }
      ];
      const { branchId } = manager.createBranch(messages, 1, 'Q1');
      assert.equal(manager.isInBranch(), true);

      manager.deleteBranch(branchId);
      assert.equal(manager.isInBranch(), false);
    });

    it('删除不存在的分支返回 false', () => {
      assert.equal(manager.deleteBranch('nonexistent'), false);
    });
  });

  // 清除分支
  describe('clearBranches()', () => {
    it('清除所有分支', () => {
      const messages = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' }
      ];
      manager.createBranch(messages, 1, 'Q1');
      manager.returnToMain();
      manager.createBranch(messages, 1, 'Q2');

      manager.clearBranches();
      assert.equal(manager.branches.length, 0);
      assert.equal(manager.isInBranch(), false);
    });
  });

  // 从分支再分叉
  describe('分支嵌套', () => {
    it('从分支中创建新分支', () => {
      const messages = [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' },
        { role: 'assistant', content: 'A2' }
      ];

      // 创建第一个分支
      const branch1 = manager.createBranch(messages, 1, 'Q1');
      assert.equal(branch1.success, true);

      // 从第一个分支再分叉
      const branchMessages = manager.getActiveBranch().messages;
      const branch2 = manager.createBranch(branchMessages, 0, 'Q1');
      assert.equal(branch2.success, true);

      assert.equal(manager.branches.length, 2);
    });
  });
});
