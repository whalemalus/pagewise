import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installIndexedDBMock();

let mockFetch;
globalThis.fetch = async () => mockFetch;

const { SkillStore } = await import('../lib/skill-store.js');

describe('SkillStore', () => {
  let store;

  beforeEach(() => {
    resetIndexedDBMock();
    store = new SkillStore('https://example.com/api/skills');
  });

  afterEach(() => {
    mockFetch = null;
  });

  // ── fetchSkills ──────────────────────────────────────────

  describe('fetchSkills', () => {
    it('returns skills from data.skills format', async () => {
      const skills = [{ id: 's1', name: 'Skill 1' }];
      mockFetch = { ok: true, status: 200, json: async () => ({ skills }) };
      const result = await store.fetchSkills();
      assert.deepEqual(result, skills);
    });

    it('returns skills from data.data format', async () => {
      const skills = [{ id: 's2', name: 'Skill 2' }];
      mockFetch = { ok: true, status: 200, json: async () => ({ data: skills }) };
      const result = await store.fetchSkills();
      assert.deepEqual(result, skills);
    });

    it('returns skills from direct array response', async () => {
      const skills = [{ id: 's3', name: 'Skill 3' }];
      mockFetch = { ok: true, status: 200, json: async () => skills };
      const result = await store.fetchSkills();
      assert.deepEqual(result, skills);
    });

    it('returns [] on HTTP error', async () => {
      mockFetch = { ok: false, status: 500, json: async () => ({}) };
      const result = await store.fetchSkills();
      assert.deepEqual(result, []);
    });

    it('returns [] on network error', async () => {
      mockFetch = { ok: true, json: async () => { throw new Error('network down'); } };
      // Override fetch to throw directly
      globalThis.fetch = async () => { throw new Error('network down'); };
      const result = await store.fetchSkills();
      assert.deepEqual(result, []);
      // Restore
      globalThis.fetch = async () => mockFetch;
    });

    it('returns [] on empty / null response body', async () => {
      mockFetch = { ok: true, status: 200, json: async () => ({}) };
      const result = await store.fetchSkills();
      assert.deepEqual(result, []);
    });
  });

  // ── installSkill ─────────────────────────────────────────

  describe('installSkill', () => {
    it('installs a valid skill into IndexedDB', async () => {
      const skill = { id: 'sk1', name: 'My Skill', prompt: 'do something' };
      const saved = await store.installSkill(skill);
      assert.equal(saved.id, 'sk1');
      assert.equal(saved.name, 'My Skill');
      assert.equal(saved.prompt, 'do something');
    });

    it('throws when skill id is missing', async () => {
      const skill = { name: 'No ID', prompt: 'test' };
      await assert.rejects(() => store.installSkill(skill), /数据不完整/);
    });

    it('throws when skill name is missing', async () => {
      const skill = { id: 'sk2', prompt: 'test' };
      await assert.rejects(() => store.installSkill(skill), /数据不完整/);
    });

    it('throws when skill is null', async () => {
      await assert.rejects(() => store.installSkill(null), /数据不完整/);
    });
  });

  // ── isInstalled ──────────────────────────────────────────

  describe('isInstalled', () => {
    it('returns true for an installed skill', async () => {
      await store.installSkill({ id: 'sk-installed', name: 'Installed', prompt: 'yes' });
      const result = await store.isInstalled('sk-installed');
      assert.equal(result, true);
    });

    it('returns false for a non-installed skill', async () => {
      const result = await store.isInstalled('sk-missing');
      assert.equal(result, false);
    });
  });
});
