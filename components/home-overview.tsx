import { ChevronDown, FileText, Inbox, Info, LockKeyhole, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { deliveryComparison, homeQuestions, reviewHighlights, setupSteps } from '@/lib/content/home';

const reviewIcons = { history: Users, validation: ShieldCheck, alerts: TriangleAlert, access: LockKeyhole };

export function HomeOverview() {
  return (
    <>
      <section id="entrega" className="public-container public-section" aria-labelledby="entrega-title">
        <div className="public-section-heading">
          <span className="public-eyebrow">Depois da revisão</span>
          <h2 id="entrega-title">PDF proforma ou Moloni ON</h2>
          <p>O pedido começa da mesma forma. O tipo de documento e a preparação necessária dependem da via escolhida.</p>
        </div>
        <table className="public-comparison" role="table">
          <caption className="sr-only">Comparação entre PDF de proforma e integração Moloni ON</caption>
          <thead>
            <tr role="row">
              <th scope="col" id="compare-aspect">Comparação</th>
              <th scope="col" id="compare-pdf"><span className="public-mode-title"><FileText aria-hidden className="size-4" />PDF de proforma</span><span className="public-mode-subtitle">Sem ligação ao ERP</span></th>
              <th scope="col" id="compare-moloni"><span className="public-mode-title"><Inbox aria-hidden className="size-4" />Moloni ON</span><span className="public-mode-subtitle">Documento na conta ligada</span></th>
            </tr>
          </thead>
          <tbody>
            {deliveryComparison.map((row) => (
              <tr key={row.id} role="row">
                <th scope="row" id={`compare-${row.id}`}>{row.label}</th>
                <td headers={`compare-pdf compare-${row.id}`}><span className="public-mobile-mode" aria-hidden>PDF de proforma</span>{row.pdf}</td>
                <td headers={`compare-moloni compare-${row.id}`}><span className="public-mobile-mode" aria-hidden>Moloni ON</span>{row.moloni}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="public-notice">
          <Info aria-hidden className="size-4 shrink-0" />
          <div><h3>Proforma não é fatura fiscal</h3><p>O PDF gerado pela aplicação é uma proforma. Não substitui uma fatura certificada. A emissão através do Moloni ON depende da conta, da configuração e da validação dessa integração.</p></div>
        </div>
      </section>

      <section id="comecar" className="public-setup-band" aria-labelledby="comecar-title">
        <div className="public-container public-section">
          <div className="public-section-heading">
            <span className="public-eyebrow">Preparar a operação</span>
            <h2 id="comecar-title">O que precisa para começar</h2>
            <p>A conta organiza os pedidos. Estes três pontos preparam a empresa para os receber e entregar o documento certo.</p>
          </div>
          <ol className="public-setup-steps">
            {setupSteps.map((step, index) => (
              <li key={step.id}><span className="public-step-number" aria-hidden>0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></li>
            ))}
          </ol>
          <p className="public-setup-note"><ShieldCheck aria-hidden className="size-4 shrink-0" />Comece com um pedido fictício para confirmar a receção, a revisão e a entrega antes de usar dados de clientes.</p>
        </div>
      </section>

      <section className="public-container public-details" aria-labelledby="controlo-title">
        <div><span className="public-eyebrow">No dia a dia</span><h2 id="controlo-title">Revisão com contexto</h2><p>A IA prepara os dados; a decisão continua consigo. O pedido original, o histórico e os alertas ajudam a conferir o rascunho antes da aprovação.</p><p className="public-review-limit">Os alertas apoiam a revisão. Não garantem que os dados extraídos estejam corretos.</p></div>
        <dl className="public-detail-list">
          {reviewHighlights.map((item) => {
            const Icon = reviewIcons[item.icon];
            return <div key={item.id}><dt><Icon aria-hidden className="size-4 shrink-0" />{item.title}</dt><dd>{item.description}</dd></div>;
          })}
        </dl>
      </section>

      <section id="duvidas" className="public-faq-band" aria-labelledby="duvidas-title">
        <div className="public-container public-section public-faq-grid">
          <div className="public-section-heading"><span className="public-eyebrow">Antes do primeiro pedido</span><h2 id="duvidas-title">Dúvidas frequentes</h2><p>O que a aplicação faz, o que depende de configuração e onde entra a sua revisão.</p></div>
          <div className="public-faq-list">
            {homeQuestions.map((item) => (
              <details key={item.id} name="home-faq" className="public-faq-item" open={item.id === 'automatico'}>
                <summary><span>{item.question}</span><ChevronDown aria-hidden className="public-faq-chevron size-4 shrink-0" /></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
