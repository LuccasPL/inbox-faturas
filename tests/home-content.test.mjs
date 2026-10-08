import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { deliveryComparison, homeQuestions, homeSections, reviewHighlights, setupSteps } from '../lib/content/home.ts';

test('public home content has unique sections, comparison rows and questions', () => {
  for (const items of [homeSections, deliveryComparison, homeQuestions, reviewHighlights, setupSteps]) {
    assert.equal(new Set(items.map(item => item.id)).size, items.length);
    for (const item of items) assert.match(item.id, /^[a-z-]+$/);
  }
  assert.equal(setupSteps.length, 3);
  assert.equal(homeQuestions.length, 6);
  for (const row of deliveryComparison) {
    assert.ok(row.label && row.pdf && row.moloni);
  }
  for (const question of homeQuestions) assert.ok(question.question && question.answer);
});

test('comparison states the proforma limitation and real Moloni setup requirements', () => {
  const row = id => deliveryComparison.find(item => item.id === id);
  assert.match(row('documento').pdf, /Não substitui uma fatura certificada/);
  assert.match(row('configuracao').pdf, /IBAN é opcional/);
  assert.match(row('configuracao').moloni, /série.*mapa de IVA/);
  assert.match(row('resultado').pdf, /serviço de envio está configurado/);
  assert.match(row('erp').pdf, /sem conta Moloni e sem n8n/);
  assert.match(row('teste').moloni, /conta de teste antes de emitir documentos reais/);
});

test('questions explain human review, incomplete drafts and external-service dependencies', () => {
  const answer = id => homeQuestions.find(item => item.id === id).answer;
  assert.match(answer('automatico'), /^Não\..*ação explícita/);
  assert.match(answer('corrigir'), /Documentos aprovados, concluídos ou em emissão ficam protegidos/);
  assert.match(answer('incompleto'), /dados obrigatórios.*antes de aprovar ou emitir/);
  assert.match(answer('integracoes'), /n8n é opcional/);
  assert.match(answer('integracoes'), /serviços configurados/);
  assert.match(answer('rececao'), /não liga automaticamente uma caixa Gmail ou Outlook/);
  assert.match(answer('enviar'), /Quem tiver a ligação pública pode aceder/);
  assert.match(reviewHighlights.find(item => item.id === 'validacao').description, /não confirmam a identidade/);
});

test('overview renders semantic comparison and native questions without Next or authentication', () => {
  const rendered = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { HomeOverview } from './components/home-overview.tsx';
    process.stdout.write(renderToStaticMarkup(createElement(HomeOverview)));
  `], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000, env: { ...process.env, NODE_OPTIONS: '' } });
  assert.equal(rendered.status, 0, rendered.stderr);
  const markup = rendered.stdout;
  for (const section of homeSections.filter(item => item.id !== 'na-pratica')) assert.ok(markup.includes(`id="${section.id}"`));
  assert.match(markup, /<caption[^>]*>Comparação entre PDF de proforma e integração Moloni ON<\/caption>/);
  assert.equal((markup.match(/scope="row"/g) ?? []).length, deliveryComparison.length);
  assert.equal((markup.match(/scope="col"/g) ?? []).length, 3);
  for (const row of deliveryComparison) {
    assert.ok(markup.includes(`headers="compare-pdf compare-${row.id}"`));
    assert.ok(markup.includes(`headers="compare-moloni compare-${row.id}"`));
  }
  assert.equal((markup.match(/<details name="home-faq"/g) ?? []).length, homeQuestions.length);
  assert.equal((markup.match(/ open=""/g) ?? []).length, 1);
  for (const question of homeQuestions) assert.ok(markup.includes(question.question));
  assert.match(markup, /Proforma não é fatura fiscal/);
  assert.doesNotMatch(markup, /<script|<form|<iframe/);
});
