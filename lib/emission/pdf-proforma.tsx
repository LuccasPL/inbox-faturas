import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import * as React from 'react';

export interface ProformaItem {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  iva_percentagem: number;
}

export interface ProformaInput {
  numero: number;
  data: Date;
  emitente: {
    nome: string;
    nif: string | null;
    morada: string | null;
    email: string | null;
    iban: string | null;
  };
  cliente: {
    nome: string;
    nif: string | null;
    email: string | null;
    morada: string | null;
  };
  items: ProformaItem[];
  observacoes: string | null;
  prazoPagamento: string | null;
}

const eur = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
});

const dt = new Intl.DateTimeFormat('pt-PT', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

function computeTotals(items: ProformaItem[]) {
  let subtotal = 0;
  let iva = 0;
  for (const it of items) {
    const linha = (it.quantidade ?? 0) * (it.preco_unitario ?? 0);
    subtotal += linha;
    iva += linha * ((it.iva_percentagem ?? 0) / 100);
  }
  return {
    subtotal: round2(subtotal),
    iva: round2(iva),
    total: round2(subtotal + iva),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  emitente: { maxWidth: 240 },
  emitenteNome: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
  emitenteLinha: { color: '#4b5563', marginBottom: 2 },
  documento: { alignItems: 'flex-end' },
  titulo: { fontSize: 18, fontWeight: 700, letterSpacing: 1 },
  subtitulo: { color: '#6b7280', marginTop: 2 },
  data: { color: '#4b5563', marginTop: 12 },
  section: { marginTop: 20 },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 1,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  clienteBox: {
    borderTop: '1pt solid #e5e7eb',
    borderBottom: '1pt solid #e5e7eb',
    paddingVertical: 10,
  },
  clienteNome: { fontWeight: 700, marginBottom: 3 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    color: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontWeight: 700,
    fontSize: 9,
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 9,
  },
  cellDesc: { flex: 3 },
  cellNum: { flex: 1, textAlign: 'right' },
  totalsBlock: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 200,
    marginBottom: 4,
  },
  totalLabel: { color: '#6b7280' },
  totalValue: {},
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 200,
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1pt solid #111827',
  },
  totalFinalLabel: { fontWeight: 700 },
  totalFinalValue: { fontWeight: 700, fontSize: 12 },
  obs: { marginTop: 16, color: '#4b5563' },
  disclaimer: {
    marginTop: 28,
    paddingTop: 10,
    borderTop: '0.5pt solid #e5e7eb',
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

export async function renderProformaPdf(input: ProformaInput): Promise<Buffer> {
  const totals = computeTotals(input.items);

  const doc = (
    <Document
      title={`Proforma ${input.numero}`}
      author={input.emitente.nome}
      producer="Inbox Faturas"
    >
      <Page size="A4" style={styles.page}>
        {/* -------------------- Cabeçalho -------------------- */}
        <View style={styles.header}>
          <View style={styles.emitente}>
            <Text style={styles.emitenteNome}>{input.emitente.nome}</Text>
            {input.emitente.nif && (
              <Text style={styles.emitenteLinha}>NIF {input.emitente.nif}</Text>
            )}
            {input.emitente.morada && (
              <Text style={styles.emitenteLinha}>{input.emitente.morada}</Text>
            )}
            {input.emitente.email && (
              <Text style={styles.emitenteLinha}>{input.emitente.email}</Text>
            )}
          </View>

          <View style={styles.documento}>
            <Text style={styles.titulo}>PROFORMA</Text>
            <Text style={styles.subtitulo}>
              N.{'º'}{' '}
              {String(input.numero).padStart(6, '0')}
            </Text>
            <Text style={styles.data}>{dt.format(input.data)}</Text>
          </View>
        </View>

        {/* -------------------- Cliente -------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Cliente</Text>
          <View style={styles.clienteBox}>
            <Text style={styles.clienteNome}>{input.cliente.nome}</Text>
            {input.cliente.nif && (
              <Text style={styles.emitenteLinha}>
                NIF {input.cliente.nif}
              </Text>
            )}
            {input.cliente.morada && (
              <Text style={styles.emitenteLinha}>{input.cliente.morada}</Text>
            )}
            {input.cliente.email && (
              <Text style={styles.emitenteLinha}>{input.cliente.email}</Text>
            )}
          </View>
        </View>

        {/* -------------------- Linhas -------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Linhas</Text>
          <View style={styles.tableHead}>
            <Text style={styles.cellDesc}>Descrição</Text>
            <Text style={styles.cellNum}>Qtd.</Text>
            <Text style={styles.cellNum}>Preço</Text>
            <Text style={styles.cellNum}>IVA</Text>
            <Text style={styles.cellNum}>Total</Text>
          </View>
          {input.items.map((it, i) => {
            const linha = it.quantidade * it.preco_unitario;
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.cellDesc}>{it.descricao}</Text>
                <Text style={styles.cellNum}>{it.quantidade}</Text>
                <Text style={styles.cellNum}>
                  {eur.format(it.preco_unitario)}
                </Text>
                <Text style={styles.cellNum}>{it.iva_percentagem}%</Text>
                <Text style={styles.cellNum}>{eur.format(linha)}</Text>
              </View>
            );
          })}
        </View>

        {/* -------------------- Totais -------------------- */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{eur.format(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalLabel}>IVA</Text>
            <Text style={styles.totalValue}>{eur.format(totals.iva)}</Text>
          </View>
          <View style={styles.totalFinalRow}>
            <Text style={styles.totalFinalLabel}>Total</Text>
            <Text style={styles.totalFinalValue}>
              {eur.format(totals.total)}
            </Text>
          </View>
        </View>

        {/* -------------------- Condições -------------------- */}
        {(input.prazoPagamento || input.emitente.iban || input.observacoes) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Condições</Text>
            {input.prazoPagamento && (
              <Text style={styles.obs}>Prazo: {input.prazoPagamento}</Text>
            )}
            {input.emitente.iban && (
              <Text style={styles.obs}>IBAN: {input.emitente.iban}</Text>
            )}
            {input.observacoes && (
              <Text style={styles.obs}>{input.observacoes}</Text>
            )}
          </View>
        )}

        <Text style={styles.disclaimer}>
          Documento proforma — sem valor fiscal. A fatura legal será emitida
          após confirmação.
        </Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
