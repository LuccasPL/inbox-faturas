import { moloniRequest } from './client';
import type {
  Customer,
  CustomerInsert,
  DocumentSet,
  DocumentType,
  InvoiceCreated,
  InvoiceInsert,
  MeData,
  Product,
  Tax,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Queries                                                                   */
/* -------------------------------------------------------------------------- */

export function me(apiKey: string): Promise<MeData> {
  const query = `
    query {
      me {
        errors { field msg }
        data {
          userId
          name
          email
          userCompanies {
            companyId
            name
            slug
            isOwner
          }
        }
      }
    }
  `;
  return moloniRequest<MeData>(apiKey, query, {}, 'me');
}

export function documentSetsForDocument(
  apiKey: string,
  companyId: number,
  documentTypeId: number,
): Promise<DocumentSet[]> {
  const query = `
    query($companyId: Int!, $documentTypeId: Int!) {
      documentSetsForDocument(companyId: $companyId, documentTypeId: $documentTypeId) {
        errors { field msg }
        data {
          documentSetId
          name
          isDefault
        }
      }
    }
  `;
  return moloniRequest<DocumentSet[]>(
    apiKey,
    query,
    { companyId, documentTypeId },
    'documentSetsForDocument',
  );
}

export function documentTypes(
  apiKey: string,
  companyId: number,
): Promise<DocumentType[]> {
  const query = `
    query($companyId: Int!) {
      documentTypes(companyId: $companyId) {
        errors { field msg }
        data {
          documentTypeId
          name
          code
        }
      }
    }
  `;
  return moloniRequest<DocumentType[]>(
    apiKey,
    query,
    { companyId },
    'documentTypes',
  );
}

export function products(
  apiKey: string,
  companyId: number,
  search?: string,
): Promise<Product[]> {
  const query = `
    query($companyId: Int!, $options: ProductsOptions) {
      products(companyId: $companyId, options: $options) {
        errors { field msg }
        data {
          productId
          name
          reference
          price
        }
      }
    }
  `;
  const options = search
    ? {
        search: { field: 'ALL', value: search },
        pagination: { page: 1, qty: 20 },
      }
    : { pagination: { page: 1, qty: 50 } };
  return moloniRequest<Product[]>(
    apiKey,
    query,
    { companyId, options },
    'products',
  );
}

export function taxes(
  apiKey: string,
  companyId: number,
): Promise<Tax[]> {
  const query = `
    query($companyId: Int!) {
      taxes(companyId: $companyId) {
        errors { field msg }
        data {
          taxId
          name
          value
          type
          isDefault
        }
      }
    }
  `;
  return moloniRequest<Tax[]>(apiKey, query, { companyId }, 'taxes');
}

export function customersSearchByVat(
  apiKey: string,
  companyId: number,
  vat: string,
): Promise<Customer[]> {
  const query = `
    query($companyId: Int!, $options: CustomersOptions) {
      customers(companyId: $companyId, options: $options) {
        errors { field msg }
        data {
          customerId
          name
          vat
          number
          email
        }
      }
    }
  `;
  return moloniRequest<Customer[]>(
    apiKey,
    query,
    {
      companyId,
      options: {
        search: { field: 'VAT', value: vat },
        pagination: { page: 1, qty: 1 },
      },
    },
    'customers',
  );
}

/* -------------------------------------------------------------------------- */
/*  Mutations                                                                 */
/* -------------------------------------------------------------------------- */

export function customerCreate(
  apiKey: string,
  companyId: number,
  data: CustomerInsert,
): Promise<Customer> {
  const query = `
    mutation($companyId: Int!, $data: CustomerInsert!) {
      customerCreate(companyId: $companyId, data: $data) {
        errors { field msg }
        data {
          customerId
          name
          vat
          number
          email
        }
      }
    }
  `;
  return moloniRequest<Customer>(
    apiKey,
    query,
    { companyId, data },
    'customerCreate',
  );
}

export function invoiceCreate(
  apiKey: string,
  companyId: number,
  data: InvoiceInsert,
): Promise<InvoiceCreated> {
  const query = `
    mutation($companyId: Int!, $data: InvoiceInsert!) {
      invoiceCreate(companyId: $companyId, data: $data) {
        errors { field msg }
        data {
          documentId
          number
          date
          expirationDate
          totalValue
          grossValue
          taxesValue
          status
        }
      }
    }
  `;
  return moloniRequest<InvoiceCreated>(
    apiKey,
    query,
    { companyId, data },
    'invoiceCreate',
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers compostos                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Procura cliente por NIF; cria se não existir. Devolve o customer.
 * Se não há NIF (cliente final), cria sempre um novo com VAT="999999990".
 */
export async function findOrCreateCustomer(
  apiKey: string,
  companyId: number,
  input: {
    nif: string | null;
    nome: string;
    email: string | null;
    morada: string | null;
  },
): Promise<Customer> {
  const vat = input.nif?.trim() || '999999990'; // consumidor final em PT

  if (input.nif) {
    const existing = await customersSearchByVat(apiKey, companyId, vat);
    if (existing.length > 0) return existing[0];
  }

  // número interno = timestamp curto + slug do nome, suficiente para unicidade
  const number =
    'C' +
    Date.now().toString(36).toUpperCase() +
    '-' +
    input.nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase();

  return customerCreate(apiKey, companyId, {
    vat,
    number,
    name: input.nome.slice(0, 100),
    countryId: 1,   // Portugal
    languageId: 1,  // Português
    email: input.email ?? undefined,
    address: input.morada ?? undefined,
  });
}
