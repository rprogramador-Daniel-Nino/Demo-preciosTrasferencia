const { test } = require('node:test');
const assert = require('node:assert');
const { politicaClaude, politicaGemini, MODELO_CLAUDE_DEFAULT, MAX_TOKENS_TECHO } = require('./politicaModelos');

test('politicaClaude pone Haiku si no viene modelo, sin mutar la entrada', () => {
  const entrada = { messages: [], max_tokens: 500 };
  const { body } = politicaClaude(entrada);
  assert.strictEqual(body.model, MODELO_CLAUDE_DEFAULT);
  assert.strictEqual(entrada.model, undefined);
  assert.strictEqual(body.max_tokens, 500);
});

test('politicaClaude acepta los modelos que usa la app', () => {
  for (const m of ['claude-haiku-4-5-20251001', 'claude-sonnet-5']) {
    assert.strictEqual(politicaClaude({ model: m, max_tokens: 4000 }).body.model, m);
  }
});

test('politicaClaude rechaza Opus, Fable y nombres raros', () => {
  for (const m of ['claude-opus-5-5', 'claude-fable-5-2', 'gpt-4', 'claude-sonnet-5/../x', 42]) {
    assert.ok(politicaClaude({ model: m }).error, String(m));
  }
});

test('politicaClaude recorta max_tokens excesivo y repone uno inválido', () => {
  assert.strictEqual(politicaClaude({ max_tokens: 200000 }).body.max_tokens, MAX_TOKENS_TECHO);
  assert.strictEqual(politicaClaude({ max_tokens: -1 }).body.max_tokens, 4000);
  assert.strictEqual(politicaClaude({}).body.max_tokens, 4000);
});

test('politicaGemini acepta la gama flash y el valor por defecto', () => {
  assert.strictEqual(politicaGemini('gemini-3-flash-preview').modelo, 'gemini-3-flash-preview');
  assert.strictEqual(politicaGemini(undefined, 'gemini-3.5-flash').modelo, 'gemini-3.5-flash');
});

test('politicaGemini rechaza otros modelos y rutas inyectadas', () => {
  for (const m of ['gemini-3-pro', 'gemini-3.5-flash:streamGenerateContent', '../../v1/x', 'gemini-3.5-flash/../pro']) {
    assert.ok(politicaGemini(m, 'gemini-3.5-flash').error, m);
  }
});
