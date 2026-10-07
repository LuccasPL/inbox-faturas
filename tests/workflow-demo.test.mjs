import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoRequest, demoSteps, demoTotals, moveDemoStep } from '../lib/demo/workflow.ts';
import { calculateTotals } from '../lib/faturas/totals.ts';

test('demo uses fictional addresses and reconciles all displayed amounts', () => {
  assert.match(demoRequest.email, /\.example$/);
  assert.match(demoRequest.recipient, /\.example$/);
  assert.deepEqual(demoTotals, { subtotal: 1500, ivaValor: 345, total: 1845 });
  assert.deepEqual(demoTotals, calculateTotals(demoRequest.items));
});

test('demo step navigation wraps in both directions', () => {
  assert.equal(demoSteps.length, 5);
  assert.equal(moveDemoStep(0, -1), 4);
  assert.equal(moveDemoStep(4, 1), 0);
  for (let index = 0; index < demoSteps.length; index++) {
    assert.equal(moveDemoStep(moveDemoStep(index, 1), -1), index);
  }
});

test('demo keeps human review and the proforma fiscal limitation explicit', () => {
  assert.match(demoSteps[2].detail, /não acontece automaticamente/);
  assert.match(demoSteps[4].detail, /não substitui uma fatura certificada/);
});
