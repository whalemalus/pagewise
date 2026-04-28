import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';
installIndexedDBMock();

import {
  saveSkill,
  getAllSkills,
  getSkillById,
  deleteSkill,
  toggleSkill,
  renderTemplate,
  extractTemplateVars,
} from '../lib/custom-skills.js';

// ─── helpers ───────────────────────────────────────────────────────────
const make = (overrides = {}) => ({
  name: 'Test Skill',
  description: 'A test skill',
  prompt: 'You are a test helper',
  enabled: true,
  ...overrides,
});

// ─── tests ─────────────────────────────────────────────────────────────

describe('saveSkill', () => {
  beforeEach(resetIndexedDBMock);
  afterEach(resetIndexedDBMock);

  it('1 — basic save returns skill with id', async () => {
    const saved = await saveSkill(make({ id: 'my_skill' }));
    assert.equal(saved.id, 'my_skill');
    assert.equal(saved.name, 'Test Skill');
  });

  it('2 — auto-generates id with skill_ prefix when none provided', async () => {
    const saved = await saveSkill(make());
    assert.ok(saved.id, 'id should be defined');
    assert.ok(saved.id.startsWith('skill_'), `id "${saved.id}" should start with "skill_"`);
  });

  it('3 — overwrites skill with same id', async () => {
    const first = await saveSkill(make({ id: 'dup', name: 'V1' }));
    const second = await saveSkill(make({ id: 'dup', name: 'V2' }));

    const all = await getAllSkills();
    const matches = all.filter(s => s.id === 'dup');
    assert.equal(matches.length, 1, 'should have exactly one entry for id "dup"');
    assert.equal(matches[0].name, 'V2');
  });
});

describe('getAllSkills', () => {
  beforeEach(resetIndexedDBMock);
  afterEach(resetIndexedDBMock);

  it('4 — returns an array', async () => {
    const result = await getAllSkills();
    assert.ok(Array.isArray(result));
  });

  it('5 — empty store returns []', async () => {
    const result = await getAllSkills();
    assert.deepEqual(result, []);
  });
});

describe('getSkillById', () => {
  beforeEach(resetIndexedDBMock);
  afterEach(resetIndexedDBMock);

  it('6 — finds existing skill by id', async () => {
    await saveSkill(make({ id: 'find_me', name: 'Found' }));
    const skill = await getSkillById('find_me');
    assert.ok(skill, 'skill should exist');
    assert.equal(skill.id, 'find_me');
    assert.equal(skill.name, 'Found');
  });

  it('7 — returns undefined for non-existing id', async () => {
    const skill = await getSkillById('no_such_id');
    assert.equal(skill, undefined);
  });
});

describe('deleteSkill', () => {
  beforeEach(resetIndexedDBMock);
  afterEach(resetIndexedDBMock);

  it('8 — deletes existing skill', async () => {
    await saveSkill(make({ id: 'to_del' }));
    await deleteSkill('to_del');

    const skill = await getSkillById('to_del');
    assert.equal(skill, undefined, 'skill should be gone after delete');
  });

  it('9 — deleting non-existing id does not throw', async () => {
    await assert.doesNotReject(() => deleteSkill('ghost'));
  });
});

describe('toggleSkill', () => {
  beforeEach(resetIndexedDBMock);
  afterEach(resetIndexedDBMock);

  it('10 — toggles enabled from true to false', async () => {
    await saveSkill(make({ id: 't1', enabled: true }));
    const toggled = await toggleSkill('t1');
    assert.equal(toggled.enabled, false);
  });

  it('11 — toggles enabled from false to true', async () => {
    await saveSkill(make({ id: 't2', enabled: false }));
    const toggled = await toggleSkill('t2');
    assert.equal(toggled.enabled, true);
  });
});

describe('renderTemplate', () => {
  it('12 — replaces a single variable', () => {
    const result = renderTemplate('Hello {{name}}!', { name: 'World' });
    assert.equal(result, 'Hello World!');
  });

  it('13 — replaces multiple variables', () => {
    const result = renderTemplate('{{greeting}} {{name}}, you have {{count}} items', {
      greeting: 'Hi',
      name: 'Alice',
      count: 3,
    });
    assert.equal(result, 'Hi Alice, you have 3 items');
  });

  it('14 — no variables returns original text', () => {
    const input = 'Plain text without placeholders';
    const result = renderTemplate(input, {});
    assert.equal(result, input);
  });
});

describe('extractTemplateVars', () => {
  it('15 — extracts variable list from template', () => {
    const vars = extractTemplateVars('Hello {{name}}, welcome to {{place}}!');
    assert.deepEqual(vars, ['name', 'place']);
  });

  it('16 — returns empty array when no variables', () => {
    const vars = extractTemplateVars('No placeholders here');
    assert.deepEqual(vars, []);
  });
});
