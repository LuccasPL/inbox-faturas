// Tipos das entities Moloni ON que usamos.
// Schema completo: https://docs.molonion.pt/reference

export interface MoloniError {
  field: string;
  msg: string;
}

export interface MoloniEnvelope<T> {
  errors: MoloniError[];
  data: T | null;
}

// me { userCompanies }
export interface UserCompany {
  companyId: number;
  name: string;
  slug: string | null;
  isOwner: boolean;
}

export interface MeData {
  userId: number;
  name: string;
  email: string;
  userCompanies: UserCompany[];
}

export interface DocumentSet {
  documentSetId: number;
  name: string;
  isDefault: boolean;
}

export interface DocumentType {
  documentTypeId: number;
  name: string;
  code: string;
}

export interface Customer {
  customerId: number;
  name: string;
  vat: string | null;
  number: string | null;
  email?: string | null;
}

export interface Product {
  productId: number;
  name: string;
  reference: string | null;
  price: number | null;
}

export interface Tax {
  taxId: number;
  name: string;
  value: number;        // taxa em percentagem, ex: 23
  type: number | null;  // 1 = % (mais comum)
  isDefault?: boolean;
}

// Input para customerCreate
export interface CustomerInsert {
  vat?: string;
  number: string;
  name: string;
  countryId: number;   // 1 = Portugal
  languageId: number;  // 1 = Português
  email?: string;
  address?: string;
}

// Input para invoiceCreate
export interface DocumentProductInput {
  productId: number;
  qty: number;
  ordering: number;
  price?: number;       // override do preço de catálogo
  discount?: number;    // % 0-100
  summary?: string;     // override da descrição
  taxes?: DocumentProductTaxInput[];
}

export interface DocumentProductTaxInput {
  taxId: number;
  value?: number;
  ordering: number;
  cumulative: boolean;
}

export interface InvoiceInsert {
  documentSetId: number;
  customerId: number;
  date: string;            // ISO datetime
  expirationDate: string;  // ISO date (YYYY-MM-DD)
  status: 0 | 1;           // 0 = draft, 1 = finalized
  products: DocumentProductInput[];
  notes?: string;
}

export interface InvoiceCreated {
  documentId: number;
  number: number;
  date: string;
  expirationDate: string;
  totalValue: number;
  grossValue: number;
  taxesValue: number;
  status: 0 | 1;
}
