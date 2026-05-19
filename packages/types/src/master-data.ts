// ===== Master Data =====
export interface FinanceCompany {
  id: string;
  code: string;
  name: string;
  companyId: string;
  createdAt: string;
}

export interface InsuranceCompany {
  id: string;
  code: string;
  name: string;
  companyId: string;
  createdAt: string;
}

export interface VehicleModel {
  id: string;
  code: string;
  name: string;
  basePrice?: number;
  companyId: string;
  createdAt: string;
}

export interface VehicleColour {
  id: string;
  code: string;
  name: string;
  hex?: string;
  companyId: string;
  createdAt: string;
}

export interface BranchRecord {
  id: string;
  code: string;
  name: string;
  orSeries?: string;
  vdoSeries?: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TinType { id: string; code: string; name: string; status: string; companyId: string; createdAt: string; }
export interface RegistrationFee { id: string; description: string; price: number; status: string; companyId: string; createdAt: string; }
export interface RoadTaxFee { id: string; description: string; price: number; status: string; companyId: string; createdAt: string; }
export interface InspectionFee { id: string; itemCode?: string; description: string; price: number; status: string; companyId: string; createdAt: string; }
export interface HandlingFee { id: string; itemCode?: string; description: string; price: number; billing?: string; status: string; companyId: string; createdAt: string; }
export interface AdditionalItem { id: string; itemCode?: string; description: string; unitPrice: number; status: string; companyId: string; createdAt: string; }
export interface PaymentType { id: string; name: string; billing?: string; status: string; companyId: string; createdAt: string; }
export interface BankRecord { id: string; name: string; accountNo?: string; status: string; companyId: string; createdAt: string; }
export interface Supplier { id: string; name: string; code?: string; companyRegNo?: string; companyAddress?: string; mailingAddress?: string; attn?: string; contactNo?: string; email?: string; status: string; companyId: string; createdAt: string; }
export interface Dealer { id: string; name: string; accCode?: string; companyRegNo?: string; companyAddress?: string; mailingAddress?: string; attn?: string; contactNo?: string; email?: string; status: string; companyId: string; createdAt: string; }
export interface UserGroup { id: string; name: string; status: string; companyId: string; createdAt: string; }
export interface DealerInvoice { id: string; invoiceNo: string; branch?: string; dealerName?: string; carModel?: string; carColour?: string; chassisNo?: string; salesPrice?: number; invoiceDate?: string; status: string; companyId: string; createdAt: string; }
export interface OfficialReceipt { id: string; receiptDate?: string; branch?: string; receiptNo: string; amount?: number; attachmentUrl?: string; verifiedBy?: string; status: string; companyId: string; createdAt: string; }

export interface MappingAdmin {
  id: string;
  rawValue: string;
  canonicalCode: string;
  notes?: string;
  companyId: string;
}

export interface BranchMapping {
  id: string;
  rawValue: string;
  canonicalCode: string;
  notes?: string;
  companyId: string;
}

export interface PaymentMethodMapping {
  id: string;
  rawValue: string;
  canonicalValue: string;
  notes?: string;
  companyId: string;
}
