import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';
installChromeMock();
installIndexedDBMock();

const { AIClient, estimateTokens } = await import('../lib/ai-client.js');
const { SkillEngine } = await import('../lib/skill-engine.js');
const { PageSense } = await import('../lib/page-sense.js');

beforeEach(() => {
  resetChromeMock();
  resetIndexedDBMock();
});

afterEach(() => {
  resetChromeMock();
  resetIndexedDBMock();
});

describe('SkillEngine — getAll 返回内置技能数组', () => {
  it('register 后 getAll 返回对应技能', () => {
    const engine = new SkillEngine();
    assert.equal(engine.getAll().length, 0);

    engine.register({ id: 'a', name: 'A', execute: () => {} });
    engine.register({ id: 'b', name: 'B', execute: () => {} });

    const all = engine.getAll();
    assert.equal(all.length, 2);
    assert.ok(all.some(s => s.id === 'a'));
    assert.ok(all.some(s => s.id === 'b'));
  });

  it('registerAll 批量注册后 getAll 返回全部', () => {
    const engine = new SkillEngine();
    engine.registerAll([
      { id: 'x', name: 'X', execute: () => {} },
      { id: 'y', name: 'Y', execute: () => {} },
      { id: 'z', name: 'Z', execute: () => {} },
    ]);
    assert.equal(engine.getAll().length, 3);
  });
});

describe('SkillEngine — get 按 id 获取', () => {
  it('返回匹配的技能对象', () => {
    const engine = new SkillEngine();
    engine.register({ id: 'hello', name: 'Hello', description: 'desc', execute: () => 'hi' });

    const skill = engine.get('hello');
    assert.ok(skill);
    assert.equal(skill.id, 'hello');
    assert.equal(skill.name, 'Hello');
    assert.equal(skill.description, 'desc');
    assert.equal(typeof skill.execute, 'function');
  });
});

describe('SkillEngine — 不存在的 id 返回 undefined', () => {
  it('get 未知 id 返回 undefined', () => {
    const engine = new SkillEngine();
    assert.equal(engine.get('nonexistent'), undefined);
  });

  it('空引擎 get 任意 id 返回 undefined', () => {
    const engine = new SkillEngine();
    assert.equal(engine.get('any-id'), undefined);
    assert.equal(engine.get(''), undefined);
  });
});

describe('SkillEngine — enable/disable 切换', () => {
  it('技能默认 enabled 为 true', () => {
    const engine = new SkillEngine();
    engine.register({ id: 's1', name: 'S1', execute: () => {} });
    assert.equal(engine.get('s1').enabled, true);
    assert.equal(engine.getEnabled().length, 1);
  });

  it('设置 enabled=false 后 getEnabled 不返回', () => {
    const engine = new SkillEngine();
    engine.register({ id: 's1', name: 'S1', execute: () => {} });
    engine.register({ id: 's2', name: 'S2', execute: () => {} });

    engine.get('s1').enabled = false;
    assert.equal(engine.getEnabled().length, 1);
    assert.equal(engine.getEnabled()[0].id, 's2');
  });

  it('重新启用后 getEnabled 恢复', () => {
    const engine = new SkillEngine();
    engine.register({ id: 's1', name: 'S1', execute: () => {} });

    engine.get('s1').enabled = false;
    assert.equal(engine.getEnabled().length, 0);

    engine.get('s1').enabled = true;
    assert.equal(engine.getEnabled().length, 1);
  });

  it('注册时显式 enabled=false', () => {
    const engine = new SkillEngine();
    engine.register({ id: 's1', name: 'S1', execute: () => {}, enabled: false });
    assert.equal(engine.get('s1').enabled, false);
    assert.equal(engine.getEnabled().length, 0);
  });
});

describe('PageSense — extractContent 处理嵌套标签', () => {
  it('去除多层嵌套标签并保留文本', () => {
    const ps = new PageSense();
    const html = '<div><p>Hello <strong><em>world</em></strong></p><ul><li>item1</li><li>item2</li></ul></div>';
    const text = ps.extractContent(html);
    assert.ok(text.includes('Hello'));
    assert.ok(text.includes('world'));
    assert.ok(text.includes('item1'));
    assert.ok(text.includes('item2'));
    assert.ok(!text.includes('<'));
    assert.ok(!text.includes('>'));
  });

  it('去除 script 和 style 标签内容', () => {
    const ps = new PageSense();
    const html = '<p>visible</p><script>var x = 1;</script><style>.cls{color:red}</style><p>also visible</p>';
    const text = ps.extractContent(html);
    assert.ok(text.includes('visible'));
    assert.ok(text.includes('also visible'));
    assert.ok(!text.includes('var x'));
    assert.ok(!text.includes('color:red'));
  });

  it('处理 HTML 实体', () => {
    const ps = new PageSense();
    const html = '<p>a &amp; b &lt; c &gt; d &quot;e&quot; f&#39;g</p>';
    const text = ps.extractContent(html);
    assert.ok(text.includes('a & b'));
    assert.ok(text.includes('< c'));
    assert.ok(text.includes('> d'));
    assert.ok(text.includes('"e"'));
    assert.ok(text.includes("f'g"));
  });
});

describe('PageSense — extractContent 处理空字符串', () => {
  it('空字符串返回空字符串', () => {
    const ps = new PageSense();
    assert.equal(ps.extractContent(''), '');
  });

  it('null/undefined 返回空字符串', () => {
    const ps = new PageSense();
    assert.equal(ps.extractContent(null), '');
    assert.equal(ps.extractContent(undefined), '');
  });

  it('纯标签无文本返回空（trim 后）', () => {
    const ps = new PageSense();
    assert.equal(ps.extractContent('<br><hr><img src="x.png">'), '');
  });
});

describe('estimateTokens — 非常长的文本不报错', () => {
  it('10 万字符文本正常返回正数', () => {
    const longText = 'a'.repeat(100_000);
    const tokens = estimateTokens(longText);
    assert.ok(tokens > 0);
    assert.equal(tokens, Math.ceil(100_000 / 3));
  });

  it('100 万字符文本不抛出异常', () => {
    const hugeText = 'x'.repeat(1_000_000);
    assert.doesNotThrow(() => {
      const result = estimateTokens(hugeText);
      assert.ok(result > 0);
    });
  });
});

describe('estimateTokens — 特殊字符处理', () => {
  it('中文文本估算合理', () => {
    const chinese = '你好世界，这是一段中文测试文本。';
    const tokens = estimateTokens(chinese);
    assert.ok(tokens > 0);
    assert.equal(tokens, Math.ceil(chinese.length / 3));
  });

  it('混合 emoji + unicode 返回正数', () => {
    const mixed = 'Hello 🌍🚀💻 你好 こんにちは مرحبا';
    const tokens = estimateTokens(mixed);
    assert.ok(tokens > 0);
  });

  it('null / undefined / 非字符串返回 0', () => {
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
    assert.equal(estimateTokens(42), 0);
    assert.equal(estimateTokens(''), 0);
  });

  it('空白字符可正常估算', () => {
    const whitespace = '   \n\t\r  ';
    const tokens = estimateTokens(whitespace);
    assert.ok(tokens > 0);
  });
});

describe('AIClient — 构造函数默认值检查', () => {
  it('无参数时使用默认值', () => {
    const client = new AIClient();
    assert.equal(client.apiKey, '');
    assert.equal(client.baseUrl, 'https://api.anthropic.com');
    assert.equal(client.model, 'claude-sonnet-4-6');
    assert.equal(client.maxTokens, 4096);
    assert.equal(client.protocol, 'openai');
  });

  it('传入空对象仍使用默认值', () => {
    const client = new AIClient({});
    assert.equal(client.apiKey, '');
    assert.equal(client.protocol, 'openai');
  });

  it('自定义值覆盖默认值', () => {
    const client = new AIClient({
      apiKey: 'sk-test',
      baseUrl: 'https://custom.api.com/',
      model: 'gpt-4',
      maxTokens: 8192,
      protocol: 'openai',
    });
    assert.equal(client.apiKey, 'sk-test');
    assert.equal(client.baseUrl, 'https://custom.api.com'); // 尾部斜杠去除
    assert.equal(client.model, 'gpt-4');
    assert.equal(client.maxTokens, 8192);
  });

  it('尾部多余斜杠被去除', () => {
    const client = new AIClient({ baseUrl: 'https://example.com///' });
    assert.equal(client.baseUrl, 'https://example.com');
  });
});

describe('AIClient — protocol 和 provider 独立设置', () => {
  it('protocol=claude 时 isClaude() 为 true', () => {
    const client = new AIClient({ protocol: 'claude' });
    assert.equal(client.isClaude(), true);
    assert.equal(client.isOpenAI(), false);
  });

  it('protocol=openai 时 isOpenAI() 为 true', () => {
    const client = new AIClient({ protocol: 'openai' });
    assert.equal(client.isOpenAI(), true);
    assert.equal(client.isClaude(), false);
  });

  it('protocol 与 baseUrl 互不影响', () => {
    const c1 = new AIClient({ protocol: 'claude', baseUrl: 'https://proxy.example.com' });
    assert.equal(c1.isClaude(), true);
    assert.equal(c1.baseUrl, 'https://proxy.example.com');

    const c2 = new AIClient({ protocol: 'openai', baseUrl: 'https://deepseek.com' });
    assert.equal(c2.isOpenAI(), true);
    assert.equal(c2.baseUrl, 'https://deepseek.com');
  });

  it('protocol 与 model 互不影响', () => {
    const client = new AIClient({ protocol: 'claude', model: 'gpt-4o' });
    assert.equal(client.isClaude(), true);
    assert.equal(client.model, 'gpt-4o'); // claude 协议也可以指定 gpt 模型名
  });
});
