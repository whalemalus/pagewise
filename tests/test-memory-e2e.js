/**
 * E2E 测试 lib/memory.js — MemorySystem 全方法覆盖
 *
 * 测试范围：
 *   init / loadUserProfile / extractKeywords / extractDomain / scoreRelevance
 *   learnFromInteraction / recall / autoSaveIfWorth / toPrompt / saveUserProfile
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installChromeMock();
installIndexedDBMock();
const { MemorySystem } = await import('../lib/memory.js');

describe('MemorySystem E2E', () => {
  let memory;

  beforeEach(async () => {
    resetChromeMock();
    resetIndexedDBMock();
    installIndexedDBMock();
    memory = new MemorySystem();
  });

  afterEach(() => {
    memory = null;
  });

  // ─── 1. init ───────────────────────────────────────────────────────────────

  it('1. init() initializes without throwing', async () => {
    await assert.doesNotReject(() => memory.init());
    assert.ok(memory.userProfile, 'userProfile should be set after init');
    assert.ok(memory.kb, 'kb (KnowledgeBase) should be initialized');
  });

  // ─── 2. loadUserProfile ────────────────────────────────────────────────────

  it('2. loadUserProfile loads default profile when nothing is stored', async () => {
    await memory.init(); // calls loadUserProfile internally
    const profile = memory.userProfile;

    assert.equal(profile.level, 'intermediate', 'default level should be intermediate');
    assert.ok(Array.isArray(profile.languages), 'languages should be an array');
    assert.ok(Array.isArray(profile.domains), 'domains should be an array');
    assert.deepEqual(profile.languages, [], 'languages should be empty by default');
    assert.deepEqual(profile.domains, [], 'domains should be empty by default');
    assert.equal(profile.interactions, 0, 'interactions should start at 0');
  });

  // ─── 3. extractKeywords ────────────────────────────────────────────────────

  it('3. extractKeywords extracts meaningful terms and filters stopwords', async () => {
    await memory.init();
    const keywords = memory.extractKeywords('How to use React hooks');

    assert.ok(Array.isArray(keywords), 'should return an array');
    // "How", "to", "use" are stopwords or too short; "React" and "hooks" should remain
    assert.ok(keywords.includes('react'), 'should contain "react" (lowercased)');
    assert.ok(keywords.includes('hooks'), 'should contain "hooks"');
    assert.ok(!keywords.includes('how'), 'should not include stopword "how"');
    assert.ok(!keywords.includes('to'), 'should not include stopword "to"');
    // The full original query is also appended
    assert.ok(keywords.includes('How to use React hooks'), 'should include original query');
  });

  // ─── 4. extractDomain ──────────────────────────────────────────────────────

  it('4. extractDomain extracts registrable domain from URLs', async () => {
    assert.equal(memory.extractDomain('https://developer.mozilla.org/en-US/docs'), 'mozilla.org');
    assert.equal(memory.extractDomain('https://www.github.com/repos'), 'github.com');
    assert.equal(memory.extractDomain('https://reactjs.org'), 'reactjs.org');
    assert.equal(memory.extractDomain('http://sub.domain.example.com/page'), 'example.com');
    // Invalid URL returns null
    assert.equal(memory.extractDomain('not-a-url'), null);
  });

  // ─── 5. scoreRelevance ────────────────────────────────────────────────────

  it('5. scoreRelevance ranks title matches highest and applies time decay', async () => {
    await memory.init();

    const entry = {
      title: 'JavaScript Closures',
      tags: ['javascript', 'closure'],
      question: 'What is a closure in JavaScript?',
      summary: 'A closure is a function combined with its lexical environment',
      answer: 'Closures allow functions to access variables from an enclosing scope',
      createdAt: new Date().toISOString(), // fresh entry
    };

    const keywords = memory.extractKeywords('JavaScript closure');
    const score = memory.scoreRelevance(entry, keywords, 'JavaScript closure');

    // Score should be positive — multiple fields match
    assert.ok(score > 0, 'score should be positive for a matching entry');

    // Title match (weight 5) + tag match (weight 4) + question match (weight 3) + summary/answer matches
    // plus the full-query bonus on title (weight 3)
    // should produce a substantial score
    assert.ok(score >= 15, `score should be substantial, got ${score}`);

    // An entry with no matching fields should score 0
    const irrelevant = {
      title: 'Cooking Recipes',
      tags: ['food'],
      question: 'How to cook pasta?',
      summary: 'Boil water first',
      answer: 'Step by step pasta recipe',
      createdAt: new Date().toISOString(),
    };
    const zeroScore = memory.scoreRelevance(irrelevant, keywords, 'JavaScript closure');
    assert.equal(zeroScore, 0, 'irrelevant entry should score 0');

    // Older entry should score lower (time decay)
    const oldEntry = {
      ...entry,
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
    };
    const oldScore = memory.scoreRelevance(oldEntry, keywords, 'JavaScript closure');
    assert.ok(oldScore < score, `old entry score (${oldScore}) should be less than fresh score (${score})`);
  });

  // ─── 6. learnFromInteraction — learn languages ─────────────────────────────

  it('6. learnFromInteraction learns programming languages from codeBlocks', async () => {
    await memory.init();

    await memory.learnFromInteraction('How to sort?', 'Use sort()', {
      codeBlocks: [{ lang: 'javascript', code: 'arr.sort()' }, { lang: 'python', code: 'sorted(arr)' }],
    });

    assert.ok(memory.userProfile.languages.includes('javascript'), 'should learn javascript');
    assert.ok(memory.userProfile.languages.includes('python'), 'should learn python');
    assert.equal(memory.userProfile.interactions, 1, 'interactions should increment');
  });

  // ─── 7. learnFromInteraction — learn domains ──────────────────────────────

  it('7. learnFromInteraction learns domains from page URL', async () => {
    await memory.init();

    await memory.learnFromInteraction('What is X?', 'X is ...', {
      url: 'https://developer.mozilla.org/en-US/docs/Web',
    });

    assert.ok(memory.userProfile.domains.includes('mozilla.org'), 'should learn mozilla.org domain');
  });

  // ─── 8. learnFromInteraction — domain limit caps at 20 ────────────────────

  it('8. learnFromInteraction caps domains array at 20 entries', async () => {
    await memory.init();

    // Pre-fill 20 domains
    for (let i = 0; i < 20; i++) {
      memory.userProfile.domains.push(`site${i}.com`);
    }

    // Add one more → oldest should shift out
    await memory.learnFromInteraction('What is X?', 'X is ...', {
      url: 'https://newsite.example.com/page',
    });

    assert.equal(memory.userProfile.domains.length, 20, 'domains should remain at 20');
    assert.ok(memory.userProfile.domains.includes('example.com'), 'should include new domain');
    assert.ok(!memory.userProfile.domains.includes('site0.com'), 'oldest domain should be shifted out');
  });

  // ─── 9. learnFromInteraction — no duplicates ──────────────────────────────

  it('9. learnFromInteraction does not add duplicate languages', async () => {
    await memory.init();

    await memory.learnFromInteraction('Q1', 'A1', {
      codeBlocks: [{ lang: 'javascript', code: 'x' }],
    });
    await memory.learnFromInteraction('Q2', 'A2', {
      codeBlocks: [{ lang: 'javascript', code: 'y' }],
    });

    const jsCount = memory.userProfile.languages.filter(l => l === 'javascript').length;
    assert.equal(jsCount, 1, 'javascript should appear only once');
    assert.equal(memory.userProfile.interactions, 2, 'interactions should be 2');
  });

  // ─── 10. learnFromInteraction — no codeBlocks still increments ────────────

  it('10. learnFromInteraction increments interactions even without codeBlocks', async () => {
    await memory.init();

    await memory.learnFromInteraction('General question', 'General answer', {});

    assert.equal(memory.userProfile.interactions, 1, 'interactions should increment');
    assert.deepEqual(memory.userProfile.languages, [], 'languages should remain empty');
  });

  // ─── 11. recall — empty query with no entries ─────────────────────────────

  it('11. recall returns empty array when no entries exist', async () => {
    await memory.init();

    const results = await memory.recall('nonexistent query');
    assert.deepEqual(results, [], 'should return empty array');
  });

  // ─── 12. recall — with matching entries ───────────────────────────────────

  it('12. recall returns knowledge entries that match the query', async () => {
    await memory.init();

    // Save an entry directly via the knowledge base
    await memory.kb.saveEntry({
      title: 'React Hooks Guide',
      content: 'Hooks let you use state in function components',
      summary: 'React hooks overview',
      tags: ['react', 'hooks'],
      question: 'How to use React hooks?',
      answer: 'Import useState and call it inside a function component to manage state.',
      sourceUrl: 'https://reactjs.org/hooks',
      sourceTitle: 'React Docs',
    });

    const results = await memory.recall('React hooks');
    assert.ok(results.length > 0, 'should return at least one result');

    const knowledge = results.filter(r => r.type === 'knowledge');
    assert.ok(knowledge.length > 0, 'should have knowledge-type entries');
    assert.equal(knowledge[0].title, 'React Hooks Guide');
    assert.ok(knowledge[0].content.includes('React hooks'), 'content should be the summary');
  });

  // ─── 13. recall — user-profile in results when languages set ──────────────

  it('13. recall includes user-profile entry when user has languages', async () => {
    await memory.init();

    // Set up a user profile with languages
    memory.userProfile.languages = ['python', 'rust'];

    const results = await memory.recall('anything');

    const profileEntries = results.filter(r => r.type === 'user-profile');
    assert.equal(profileEntries.length, 1, 'should have exactly one user-profile entry');
    assert.ok(profileEntries[0].content.includes('python'), 'should mention python');
    assert.ok(profileEntries[0].content.includes('rust'), 'should mention rust');
  });

  // ─── 14. recall — no user-profile when languages empty ────────────────────

  it('14. recall omits user-profile when user has no languages', async () => {
    await memory.init();

    const results = await memory.recall('some query');

    const profileEntries = results.filter(r => r.type === 'user-profile');
    assert.equal(profileEntries.length, 0, 'should not include user-profile when languages empty');
  });

  // ─── 15. autoSaveIfWorth — short answer returns null ──────────────────────

  it('15. autoSaveIfWorth returns null for short answers (< 100 chars)', async () => {
    await memory.init();

    const result = await memory.autoSaveIfWorth(
      'What is a function?',
      'A function is reusable code.',
      {},
      null
    );

    assert.equal(result, null, 'short answer should return null');
  });

  // ─── 16. autoSaveIfWorth — non-tech content returns null ──────────────────

  it('16. autoSaveIfWorth returns null for non-technical content', async () => {
    await memory.init();

    const longNonTechAnswer = 'The history of pasta dates back to ancient times. '
      + 'It is believed that pasta was first made in China and then brought to Italy. '
      + 'Marco Polo is often credited with introducing pasta to Italy, but this is a myth. '
      + 'Pasta has become a staple food worldwide.';

    const result = await memory.autoSaveIfWorth(
      'What is the history of pasta?',
      longNonTechAnswer,
      {},
      null
    );

    assert.equal(result, null, 'non-tech content should return null');
  });

  // ─── 17. autoSaveIfWorth — tech content returns result ────────────────────

  it('17. autoSaveIfWorth returns saved entry for technical content', async () => {
    await memory.init();

    const aiClient = {
      generateSummaryAndTags: async (text) => ({
        summary: 'How to use JavaScript Array.sort()',
        tags: ['javascript', 'sort', 'array'],
      }),
    };

    const longTechAnswer = 'In JavaScript, the Array.prototype.sort() function sorts the elements '
      + 'of an array in place and returns the array. By default, sort() converts elements to strings '
      + 'and sorts by UTF-16 code unit values. For numeric sorting, provide a compare function. '
      + 'The function should return negative, zero, or positive.';

    const result = await memory.autoSaveIfWorth(
      'How to use sort function in JavaScript?',
      longTechAnswer,
      { title: 'JS Sort Guide', url: 'https://developer.mozilla.org/sort', content: 'sort docs' },
      aiClient
    );

    assert.ok(result, 'should return a result object');
    assert.ok(result.id, 'saved entry should have an id');
    assert.equal(result.title, 'JS Sort Guide');
    assert.deepEqual(result.tags, ['javascript', 'sort', 'array']);
  });

  // ─── 18. autoSaveIfWorth — duplicate returns null ─────────────────────────

  it('18. autoSaveIfWorth returns null for duplicate entries', async () => {
    await memory.init();

    const aiClient = {
      generateSummaryAndTags: async () => ({
        summary: 'How to use JavaScript functions',
        tags: ['javascript', 'function'],
      }),
    };

    const longTechAnswer = 'In JavaScript, the function keyword declares a function. '
      + 'Functions are first-class objects and can be assigned to variables. '
      + 'Arrow functions provide a shorter syntax. '
      + 'Functions can accept parameters and return values.';

    const ctx = { title: 'JS Functions', url: 'https://example.com/js', content: 'docs' };

    // First save should succeed
    const first = await memory.autoSaveIfWorth(
      'What is a JavaScript function?',
      longTechAnswer,
      ctx,
      aiClient
    );
    assert.ok(first, 'first save should return a result');

    // Second save with same title should be detected as duplicate
    const second = await memory.autoSaveIfWorth(
      'What is a JavaScript function?',
      longTechAnswer,
      ctx,
      aiClient
    );
    assert.equal(second, null, 'duplicate should return null');
  });

  // ─── 19. toPrompt — empty when no memories ───────────────────────────────

  it('19. toPrompt returns empty string when no memories exist', async () => {
    await memory.init();

    const prompt = await memory.toPrompt('some query that has no matches');
    assert.equal(prompt, '', 'should return empty string when no memories');
  });

  // ─── 20. toPrompt — includes user profile ────────────────────────────────

  it('20. toPrompt includes user profile level and languages', async () => {
    await memory.init();

    // Save a matching entry so recall returns results
    await memory.kb.saveEntry({
      title: 'Python Decorators',
      content: 'Decorators wrap functions',
      summary: 'Guide to Python decorators',
      tags: ['python', 'decorator'],
      question: 'How to use decorators in Python?',
      answer: 'Use the @decorator syntax above a function definition.',
      sourceUrl: 'https://python.org/decorators',
      sourceTitle: 'Python Docs',
    });

    memory.userProfile.level = 'advanced';
    memory.userProfile.languages = ['python', 'go'];

    const prompt = await memory.toPrompt('Python decorators');

    assert.ok(prompt.length > 0, 'prompt should not be empty');
    assert.ok(prompt.includes('相关记忆'), 'prompt should contain memory header');
    assert.ok(prompt.includes('advanced'), 'prompt should include user level');
    assert.ok(prompt.includes('python'), 'prompt should include user languages');
    assert.ok(prompt.includes('go'), 'prompt should include all user languages');
  });

  // ─── 21. toPrompt — without user profile ──────────────────────────────────

  it('21. toPrompt omits user profile section when level is missing', async () => {
    await memory.init();

    await memory.kb.saveEntry({
      title: 'CSS Flexbox',
      content: 'Flexbox layout',
      summary: 'CSS flexbox guide',
      tags: ['css', 'flexbox'],
      question: 'How to center with flexbox?',
      answer: 'Use display:flex and justify-content:center and align-items:center.',
      sourceUrl: 'https://css-tricks.com/flexbox',
      sourceTitle: 'CSS Tricks',
    });

    // Clear level to simulate missing profile
    memory.userProfile.level = null;
    memory.userProfile.languages = [];

    const prompt = await memory.toPrompt('CSS flexbox');

    assert.ok(prompt.includes('相关记忆'), 'should have memory section');
    assert.ok(!prompt.includes('用户水平'), 'should not include user level when null');
  });

  // ─── 22. saveUserProfile — persists to chrome.storage.sync ────────────────

  it('22. saveUserProfile persists changes to chrome.storage.sync', async () => {
    await memory.init();

    memory.userProfile.level = 'advanced';
    memory.userProfile.languages = ['rust'];
    memory.userProfile.domains = ['systems programming'];
    memory.userProfile.interactions = 42;

    await memory.saveUserProfile();

    // Read directly from storage to verify persistence
    const stored = await chrome.storage.sync.get('userProfile');
    assert.ok(stored.userProfile, 'userProfile should be stored');
    assert.equal(stored.userProfile.level, 'advanced');
    assert.deepEqual(stored.userProfile.languages, ['rust']);
    assert.deepEqual(stored.userProfile.domains, ['systems programming']);
    assert.equal(stored.userProfile.interactions, 42);
  });

  // ─── 23. saveUserProfile — reload round-trip ──────────────────────────────

  it('23. saveUserProfile survives a loadUserProfile round-trip', async () => {
    await memory.init();

    memory.userProfile.level = 'beginner';
    memory.userProfile.languages = ['java', 'kotlin'];
    memory.userProfile.domains = ['android'];
    memory.userProfile.preferences = { theme: 'dark' };
    memory.userProfile.interactions = 7;

    await memory.saveUserProfile();

    // Simulate a fresh session: clear in-memory profile, reload from storage
    memory.userProfile = null;
    await memory.loadUserProfile();

    assert.equal(memory.userProfile.level, 'beginner');
    assert.deepEqual(memory.userProfile.languages, ['java', 'kotlin']);
    assert.deepEqual(memory.userProfile.domains, ['android']);
    assert.deepEqual(memory.userProfile.preferences, { theme: 'dark' });
    assert.equal(memory.userProfile.interactions, 7);
  });

  // ─── 24. saveUserProfile — overwrite existing profile ─────────────────────

  it('24. saveUserProfile overwrites previously saved profile', async () => {
    await memory.init();

    // First save
    memory.userProfile.level = 'beginner';
    memory.userProfile.languages = ['html'];
    await memory.saveUserProfile();

    // Update and save again
    memory.userProfile.level = 'advanced';
    memory.userProfile.languages = ['html', 'css', 'javascript'];
    await memory.saveUserProfile();

    // Reload
    memory.userProfile = null;
    await memory.loadUserProfile();

    assert.equal(memory.userProfile.level, 'advanced', 'should have updated level');
    assert.deepEqual(memory.userProfile.languages, ['html', 'css', 'javascript'], 'should have updated languages');
  });

  // ─── 25. learnFromInteraction — saves profile to storage ──────────────────

  it('25. learnFromInteraction persists learned data via saveUserProfile', async () => {
    await memory.init();

    await memory.learnFromInteraction('Q', 'A', {
      codeBlocks: [{ lang: 'typescript' }],
      url: 'https://docs.typescriptlang.org',
    });

    // Verify storage was updated
    const stored = await chrome.storage.sync.get('userProfile');
    assert.ok(stored.userProfile, 'profile should be saved to storage');
    assert.ok(stored.userProfile.languages.includes('typescript'), 'typescript should be in stored profile');
    assert.ok(stored.userProfile.domains.includes('typescriptlang.org'), 'domain should be in stored profile');
  });
});
