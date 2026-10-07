'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, FileCheck2, FileText, Inbox, Mail, Paperclip, Pause, Play, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { demoRequest, demoSteps, demoTotals, moveDemoStep, type DemoMode } from '@/lib/demo/workflow';
import { cn } from '@/lib/utils';

const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const icons = [Mail, ShieldCheck, FileCheck2, FileText, Send];

export function WorkflowDemo({ embedded = false }: { embedded?: boolean }) {
  const id = useId();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<DemoMode>('pdf_proforma');
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [days, setDays] = useState('30');
  const [approved, setApproved] = useState(false);
  const [sent, setSent] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const stepButtons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!playing || hovered || focused || !visible) return;
    const timer = window.setInterval(() => setStep(current => moveDemoStep(current, 1)), 7000);
    return () => window.clearInterval(timer);
  }, [playing, hovered, focused, visible]);

  function goTo(next: number) {
    setPlaying(false);
    setStep(next);
  }

  function reset() {
    goTo(0);
    setDays('30');
    setApproved(false);
    setSent(false);
  }

  function onStepKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = moveDemoStep(index, 1);
    else if (event.key === 'ArrowLeft') next = moveDemoStep(index, -1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = demoSteps.length - 1;
    else return;
    event.preventDefault();
    goTo(next);
    stepButtons.current[next]?.focus();
  }

  const current = demoSteps[step];

  return (
    <section
      className={cn('workflow-demo', embedded && 'workflow-demo--embedded')}
      aria-roledescription="carrossel"
      aria-label="Um pedido na prática"
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      <div className="demo-toolbar">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="demo-label">Demonstração</span>
          <span className="hidden sm:inline">Dados fictícios · sem envios reais</span>
        </div>
        <div className="demo-modes" role="group" aria-label="Modo de emissão do exemplo">
          {(['pdf_proforma', 'moloni'] as const).map(value => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setPlaying(false); setSent(false); }}>
              {value === 'pdf_proforma' ? <FileText className="size-3.5" /> : <Inbox className="size-3.5" />}
              {value === 'pdf_proforma' ? 'PDF proforma' : 'Moloni ON'}
            </button>
          ))}
        </div>
      </div>

      <div className="demo-steps" role="tablist" aria-label="Etapas do pedido">
        {demoSteps.map((item, index) => {
          const Icon = icons[index];
          return (
            <button
              key={item.title} ref={node => { stepButtons.current[index] = node; }} type="button"
              role="tab" id={`${id}-step-${index}`} aria-selected={step === index}
              aria-controls={`${id}-panel`} tabIndex={step === index ? 0 : -1}
              onClick={() => goTo(index)} onKeyDown={event => onStepKey(event, index)}
            >
              <span className="demo-step-icon"><Icon className="size-4" /></span>
              <span>{item.title}</span>
              <span className="demo-step-number" aria-hidden="true">0{index + 1}</span>
            </button>
          );
        })}
      </div>

      <div
        id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-step-${step}`} tabIndex={0}
        className="demo-stage"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={event => {
          if ((event.target as HTMLElement).closest('button, input, select, a')) return;
          touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }}
        onTouchCancel={() => { touchStart.current = null; }}
        onTouchEnd={event => {
          if (!touchStart.current) return;
          const dx = event.changedTouches[0].clientX - touchStart.current.x;
          const dy = event.changedTouches[0].clientY - touchStart.current.y;
          touchStart.current = null;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(moveDemoStep(step, dx < 0 ? 1 : -1));
        }}
      >
        <div className="demo-caption">
          <span className="text-xs font-medium text-primary">PASSO 0{step + 1}</span>
          <h2>{current.heading}</h2>
          <p>{current.description}</p>
          <div className="demo-note"><ShieldCheck className="size-4 shrink-0" /><span>{current.detail}</span></div>
        </div>
        <div className="demo-screen" key={step}>
          <div className="demo-screen-bar">
            <span className="flex items-center gap-2"><FileText className="size-4 text-primary" /><strong>Inbox Faturas</strong><ChevronRight className="size-3 text-muted-foreground" /><span>{current.title}</span></span>
            <span className="hidden text-xs text-muted-foreground sm:block">Atelier Horizonte</span>
          </div>
          {step === 0 && (
            <div className="demo-email">
              <div className="flex items-center justify-between gap-3"><span className="demo-avatar">AH</span><span className="text-xs text-muted-foreground">Hoje, 09:41</span></div>
              <h3>{demoRequest.subject}</h3>
              <dl className="demo-email-meta"><div><dt>De</dt><dd>{demoRequest.email}</dd></div><div><dt>Para</dt><dd>{demoRequest.recipient}</dd></div></dl>
              <div className="demo-email-body"><p>Bom dia,</p><p>Podem preparar o documento dos serviços de setembro? Foram 10 horas de consultoria a 120 € e o relatório final a 300 €, acrescidos de IVA a 23%.</p><p>Dados: Atelier Horizonte, NIF {demoRequest.nif}.<br />Pagamento a 30 dias. Obrigada!</p></div>
              <div className="demo-attachment"><Paperclip className="size-4" /><span>pedido-setembro.pdf</span><span className="ml-auto text-xs text-muted-foreground">PDF · exemplo</span></div>
              <DemoAction onClick={() => goTo(1)}>Ver triagem</DemoAction>
            </div>
          )}
          {step === 1 && (
            <div className="demo-process">
              <div className="demo-result"><span className="demo-result-icon"><Sparkles className="size-6" /></span><h3>Pedido identificado</h3><p>Pedido explícito com serviços, valores e dados do cliente.</p><span className="demo-status">Confiança alta · exemplo</span></div>
              <div className="demo-checks">{['Email e anexo disponíveis', 'Cliente e NIF extraídos', '2 linhas e IVA preparados'].map(text => <div key={text}><CheckCircle2 className="size-4 text-primary" /><span>{text}</span><Check className="ml-auto size-4 text-primary" /></div>)}</div>
              <div className="demo-human"><ShieldCheck className="size-4" />Pendente de revisão humana</div>
              <DemoAction onClick={() => goTo(2)}>Abrir rascunho</DemoAction>
            </div>
          )}
          {step === 2 && (
            <div className="demo-review">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><span className="text-xs text-muted-foreground">Cliente</span><h3>{demoRequest.client}</h3><span className="text-xs text-muted-foreground">NIF {demoRequest.nif} · dados de exemplo</span></div><span className="demo-status demo-status--amber">Por rever</span></div>
              <div className="demo-line-items"><div className="demo-line-head"><span>Descrição</span><span>Qtd.</span><span>Preço</span></div>{demoRequest.items.map(item => <div key={item.descricao}><span>{item.descricao}<small>IVA {item.iva_percentagem}%</small></span><span>{item.quantidade}</span><span>{money.format(item.preco_unitario)}</span></div>)}</div>
              <div className="demo-totals"><span>Subtotal <strong>{money.format(demoTotals.subtotal)}</strong></span><span>IVA <strong>{money.format(demoTotals.ivaValor)}</strong></span><span className="demo-total">Total <strong>{money.format(demoTotals.total)}</strong></span></div>
              <div className="demo-payment"><label htmlFor={`${id}-payment`}>Prazo de pagamento</label><select id={`${id}-payment`} value={days} onChange={event => { setDays(event.target.value); setPlaying(false); setApproved(false); }}><option value="15">15 dias</option><option value="30">30 dias</option><option value="60">60 dias</option></select></div>
              <DemoAction icon={<CheckCircle2 className="size-4" />} onClick={() => { setApproved(true); goTo(3); }}>Simular aprovação</DemoAction>
            </div>
          )}
          {step === 3 && (
            <div className="demo-process">
              <div className="demo-result"><span className="demo-result-icon"><FileCheck2 className="size-6" /></span><h3>{approved ? 'Revisão aprovada no exemplo' : 'Revisão antes da emissão'}</h3><p>{demoRequest.client} · {money.format(demoTotals.total)}<br />Pagamento a {days} dias</p><span className={cn('demo-status', !approved && 'demo-status--amber')}>{approved ? 'Aprovação simulada' : 'Aprovação necessária'}</span></div>
              <div className="demo-output"><FileText className="size-5 text-primary" /><div><strong>{mode === 'pdf_proforma' ? 'Proforma em PDF' : 'Documento no Moloni ON'}</strong><p>{mode === 'pdf_proforma' ? 'Número sequencial e ligação de partilha.' : 'Rascunho ou documento final, conforme a emissão escolhida.'}</p></div></div>
              <p className="demo-disclaimer">{mode === 'pdf_proforma' ? 'Sem validade fiscal. Não substitui uma fatura certificada.' : 'A emissão real requer uma conta Moloni ON configurada.'}</p>
              <DemoAction icon={<FileText className="size-4" />} onClick={() => { if (!approved) setApproved(true); else goTo(4); }}>{!approved ? 'Simular aprovação' : mode === 'pdf_proforma' ? 'Simular emissão da proforma' : 'Ver resultado no Moloni'}</DemoAction>
            </div>
          )}
          {step === 4 && (
            <div className="demo-delivery">
              {mode === 'pdf_proforma' ? (
                <figure className="demo-document-preview">
                  <Image src="/demo/proforma-example.png" width={802} height={652} sizes="(max-width: 767px) 320px, 410px" alt="Proforma fictícia para Atelier Horizonte: subtotal 1.500 euros, IVA 345 euros e total 1.845 euros." />
                  <figcaption>Pagamento a {days} dias · exemplo sem validade fiscal</figcaption>
                </figure>
              ) : (
                <div className="demo-result py-6"><span className="demo-result-icon"><CheckCircle2 className="size-6" /></span><h3>Documento associado ao pedido</h3><p>O número e o estado devolvidos pelo ERP aparecem na revisão e no histórico.</p><div className="demo-checks mt-5"><div><FileText className="size-4 text-primary" /><span>Documento Moloni · exemplo</span></div><div><ShieldCheck className="size-4 text-primary" /><span>Histórico preservado</span></div></div></div>
              )}
              <div className="demo-delivery-footer">
                {mode === 'pdf_proforma' ? <><span className="text-xs text-muted-foreground break-all">Para: {demoRequest.email}</span><DemoAction icon={sent ? <CheckCircle2 className="size-4" /> : <Send className="size-4" />} onClick={() => { setSent(true); setPlaying(false); }} disabled={sent}>{sent ? 'Envio simulado' : 'Simular envio por email'}</DemoAction></> : <DemoAction icon={<RotateCcw className="size-4" />} onClick={reset}>Recomeçar exemplo</DemoAction>}
                <p className="text-xs text-muted-foreground" role="status">{sent && mode === 'pdf_proforma' ? 'Simulação concluída. Nenhum email foi enviado.' : 'Nenhum documento real foi emitido.'}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="demo-controls">
        <div className="flex items-center gap-2">
          <button className="demo-icon-button" type="button" title={playing ? 'Pausar demonstração' : 'Reproduzir demonstração'} aria-label={playing ? 'Pausar demonstração' : 'Reproduzir demonstração'} aria-pressed={playing} onClick={() => { setPlaying(!playing); setFocused(false); setHovered(false); }}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
          <button className="demo-icon-button" type="button" title="Recomeçar demonstração" aria-label="Recomeçar demonstração" onClick={reset}><RotateCcw className="size-4" /></button>
          <span className="text-xs text-muted-foreground">0{step + 1} <span className="mx-1 text-border">/</span> 05</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="demo-icon-button" type="button" title="Etapa anterior" aria-label="Etapa anterior" onClick={() => goTo(moveDemoStep(step, -1))}><ArrowLeft className="size-4" /></button>
          <button className="demo-next" type="button" onClick={() => step === 4 ? reset() : goTo(step + 1)}>{step === 4 ? 'Recomeçar' : 'Próximo passo'}<ArrowRight className="size-4" /></button>
        </div>
      </div>
      <p className="demo-mobile-disclaimer">Dados fictícios · sem envios ou emissões reais</p>
    </section>
  );
}

function DemoAction({ children, onClick, icon = <ArrowRight className="size-4" />, disabled = false }: { children: ReactNode; onClick: () => void; icon?: ReactNode; disabled?: boolean }) {
  return <button type="button" className="demo-action" onClick={onClick} disabled={disabled}>{children}{icon}</button>;
}
