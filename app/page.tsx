import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';
import { ArrowRight, FileText, Inbox, PlayCircle, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { WorkflowDemo } from '@/components/workflow-demo';

export default function Home() {
  return (
    <main className="public-home">
      <header className="public-header">
        <div className="public-container flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/" className="flex items-center gap-2.5 font-semibold"><span className="brand-symbol"><FileText className="size-5" /></span>Inbox Faturas<span className="brand-beta hidden sm:inline">Beta</span></Link>
          <div className="flex items-center gap-2">
            <Link href="#na-pratica" className="mr-3 hidden text-sm text-muted-foreground hover:text-foreground lg:inline">Na prática</Link>
            <ThemeToggle />
            <Show when="signed-out"><Button variant="ghost" asChild><Link href="/sign-in">Entrar</Link></Button><Button asChild><Link href="/sign-up">Criar conta<ArrowRight className="size-4" /></Link></Button></Show>
            <Show when="signed-in"><Button asChild><Link href="/inbox">Abrir inbox<ArrowRight className="size-4" /></Link></Button><UserButton /></Show>
          </div>
        </div>
      </header>

      <section id="na-pratica" className="public-container public-intro">
        <div className="public-intro-heading">
          <div><div className="public-eyebrow"><PlayCircle className="size-3.5" />Um pedido na prática</div><h1>Inbox Faturas</h1><p>O email chega. A IA prepara. A decisão é sua.</p></div>
          <div className="public-intro-side"><span><ShieldCheck className="size-4 text-primary" />Revisão humana, sempre.</span><span>Do pedido à entrega, num só lugar.</span></div>
        </div>
        <WorkflowDemo />
      </section>

      <section className="public-workflow-band">
        <div className="public-container grid gap-7 py-9 md:grid-cols-3">
          {[
            { Icon: Inbox, title: 'Uma inbox para os pedidos', text: 'Emails, anexos e estado da revisão, sem perder o pedido original.' },
            { Icon: SlidersHorizontal, title: 'O controlo fica consigo', text: 'Reveja o cliente, o IVA e os valores antes de aprovar qualquer documento.' },
            { Icon: FileText, title: 'PDF ou Moloni ON', text: 'Proforma para partilhar com o cliente, ou documento através do ERP configurado.' },
          ].map(({ Icon, title, text }) => <div key={title} className="public-workflow-item"><Icon className="size-5 shrink-0 text-primary" /><div><h2>{title}</h2><p>{text}</p></div></div>)}
        </div>
      </section>

      <section className="public-container public-details">
        <div><span className="public-eyebrow">No dia a dia</span><h2>O contexto acompanha cada pedido.</h2><p>Dados extraídos são um ponto de partida. A revisão, o histórico e os alertas ajudam a decidir com informação.</p></div>
        <dl className="public-detail-list">
          <div><dt><Users className="size-4" />Histórico por cliente</dt><dd>Documentos confirmados e dados anteriores disponíveis para consulta.</dd></div>
          <div><dt><ShieldCheck className="size-4" />Validação e alertas</dt><dd>NIF, IBAN e diferenças relevantes sinalizados durante a revisão.</dd></div>
          <div><dt><FileText className="size-4" />Entrega e acompanhamento</dt><dd>Na proforma, descarregue o PDF, envie por email ou partilhe a ligação. O envio requer configuração.</dd></div>
        </dl>
      </section>

      <section className="public-bottom-band">
        <div className="public-container flex flex-col justify-between gap-5 py-8 sm:flex-row sm:items-center">
          <div><h2>O próximo pedido pode começar aqui.</h2><p>Configure a empresa e o endereço de receção na sua conta.</p></div>
          <Show when="signed-out"><Button size="lg" asChild><Link href="/sign-up">Criar conta<ArrowRight className="size-4" /></Link></Button></Show>
          <Show when="signed-in"><Button size="lg" asChild><Link href="/inbox">Voltar à inbox<ArrowRight className="size-4" /></Link></Button></Show>
        </div>
      </section>
      <footer className="public-container flex flex-wrap justify-between gap-3 py-6 text-xs text-muted-foreground"><span>Inbox Faturas · Construído em Portugal</span><span>Proformas sem validade fiscal · Moloni ON requer configuração</span></footer>
    </main>
  );
}
