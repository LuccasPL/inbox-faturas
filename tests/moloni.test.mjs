import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { moloniRequest, MoloniApiError } from '../lib/moloni/client.ts';

test('Moloni distinguishes explicit validation errors from uncertain outcomes', async () => {
  for (const [body, status, outcomeUnknown] of [
    [{ data: { invoiceCreate: { errors: [{ field: 'vat', msg: 'invalid' }], data: null } } }, 200, false],
    [{ errors: [{ message: 'Unauthorized' }] }, 401, false],
    [{ errors: [{ message: 'Unavailable' }] }, 503, true],
    [{ data: {} }, 200, true],
  ]) {
    const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json(body, { status }));
    try {
      await assert.rejects(moloniRequest('test-key', 'mutation {}', {}, 'invoiceCreate'),
        (error) => error instanceof MoloniApiError && error.outcomeUnknown === outcomeUnknown);
      assert.equal(fetchMock.mock.callCount(), 1);
    } finally { fetchMock.mock.restore(); }
  }
});
