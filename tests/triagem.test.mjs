import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createRequire } from 'node:module';
import { parseTriagemResult, TriagemValidationError } from '../lib/validation/triagem.ts';

test('triage accepts only known decisions, confidence values and bounded reasons', () => {
  for (const input of [null, [], {}, { is_fatura_request: 'sim', confianca: 'alta', motivo: '' },
    { is_fatura_request: true, confianca: 'alta', motivo: 'Teste' },
    { is_fatura_request: 'delete', confianca: 'alta', motivo: 'Teste' },
    { is_fatura_request: 'sim', confianca: 1, motivo: 'Teste' },
    { is_fatura_request: 'sim', confianca: 'alta', motivo: {} },
    { is_fatura_request: 'sim', confianca: 'alta', motivo: 'x'.repeat(501) },
    { is_fatura_request: 'sim', confianca: 'alta', motivo: '\u0000' }]) {
    assert.throws(() => parseTriagemResult(input), TriagemValidationError);
  }
  assert.deepEqual(parseTriagemResult({ is_fatura_request: 'sim', confianca: 'alta', motivo: ' Pedido claro ', extra: 'ignored' }),
    { is_fatura_request: 'sim', confianca: 'alta', motivo: 'Pedido claro' });
});

test('uncertain negative classifications always return to human review', () => {
  for (const confianca of ['media', 'baixa']) {
    const result = parseTriagemResult({ is_fatura_request: 'nao', confianca, motivo: 'Não é claro' });
    assert.equal(result.is_fatura_request, 'incerto');
    assert.equal(result.confianca, confianca);
    assert.match(result.motivo, /ignorar automaticamente/);
  }
  assert.equal(parseTriagemResult({ is_fatura_request: 'nao', confianca: 'alta', motivo: 'Newsletter' }).is_fatura_request, 'nao');
});

test('triage provider output is validated at the integration boundary without real requests', async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'synthetic-test-key';
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('Network disabled in this test'); });
  try {
    const modules = [await import('@anthropic-ai/sdk/resources/messages/messages'),
      createRequire(import.meta.url)('@anthropic-ai/sdk/resources/messages/messages')];
    const prototypes = [...new Set(modules.map((module) => module.Messages.prototype))];
    const { triarEmail } = await import('../lib/extraction/triagem-email.ts');
    for (const [input, valid, name = 'classificar_email'] of [
      [{ is_fatura_request: 'sim', confianca: 'alta', motivo: 'Pedido' }, true],
      [{ is_fatura_request: 'nao', confianca: 'baixa', motivo: 'Ambíguo' }, true],
      [{ is_fatura_request: 'nao', confianca: 'unknown', motivo: 'Inválido' }, false],
      [{ is_fatura_request: 'sim', confianca: 'alta', motivo: 'Pedido' }, false, 'unexpected_tool'],
    ]) {
      const mocks = prototypes.map((prototype) => mock.method(prototype, 'create', async () => ({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'test-model',
        content: [{ type: 'tool_use', id: 'tool_test', name, input }],
        stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      })));
      try {
        if (valid) {
          const result = await triarEmail('Teste', 'Conteúdo de teste', 'test@example.com');
          assert.equal(result.is_fatura_request, input.confianca === 'baixa' ? 'incerto' : 'sim');
        } else {
          await assert.rejects(triarEmail('Teste', 'Conteúdo de teste', 'test@example.com'), TriagemValidationError);
        }
        assert.equal(mocks.reduce((sum, method) => sum + method.mock.callCount(), 0), 1);
        assert.equal(network.mock.callCount(), 0);
      } finally { for (const method of mocks) method.mock.restore(); }
    }
  } finally {
    network.mock.restore();
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});
