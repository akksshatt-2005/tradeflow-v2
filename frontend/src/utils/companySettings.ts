export interface CompanySettings {
  // 1. Bank & UPI QR Code
  bankName: string;
  accountNo: string;
  ifscCode: string;
  branch: string;
  accountName: string;
  upiId: string;
  upiPayeeName: string;

  // 2. Terms & Legal
  jurisdiction: string;
  termsLine1: string;
  termsLine2: string;
  termsLine3: string;
  creditInterestRate: string;

  // 3. Pharma Compliance (DL 20B/21B, FSSAI)
  dl20b: string;
  dl21b: string;
  fssaiNo: string;
  requireDoctorOnScheduleH: boolean;

  // 4. Print & Paper Preset
  paperSize: 'A4_PORTRAIT' | 'A5_LANDSCAPE' | 'THERMAL_80MM';
  showUpiQrOnInvoice: boolean;

  // 5. Invoice Numbering Series & Sequence
  invoicePrefix: string;
  invoiceStartNumber: string;
  autoResetFinancialYear: boolean;

  // 6. Inventory & Expiry Alert Rules
  expiryWarningDays: 30 | 60 | 90 | 180;
  lowStockThreshold: number;
  preventNegativeStock: boolean;

  // 7. Branding & Stamps (Logo + Mohar)
  companyLogo?: string;
  signatureImage?: string;
}

export const getDefaultSettings = (company?: any): CompanySettings => {
  const compName = company?.name || '';
  const compCity = company?.city || 'LUCKNOW';
  return {
    bankName: 'Bank Of India',
    accountNo: '777140000006',
    ifscCode: 'BIN0537594',
    branch: `${compCity}-Branch`,
    accountName: compName,
    upiId: '',
    upiPayeeName: compName,

    jurisdiction: `${compCity.toUpperCase()} Jurisdiction only`,
    termsLine1: 'Goods once sold will not be taken back or exchanged.',
    termsLine2: `All disputes subject to ${compCity.toUpperCase()} Jurisdiction only.`,
    termsLine3: 'Bills not paid due date will attract 24% interest.',
    creditInterestRate: '24',

    dl20b: company?.drugLicenseNo || '20B-194000',
    dl21b: '21B-194001',
    fssaiNo: '',
    requireDoctorOnScheduleH: true,

    paperSize: 'A4_PORTRAIT',
    showUpiQrOnInvoice: true,

    invoicePrefix: 'INV-',
    invoiceStartNumber: '1001',
    autoResetFinancialYear: true,

    expiryWarningDays: 90,
    lowStockThreshold: 10,
    preventNegativeStock: false,

    companyLogo: undefined,
    signatureImage: undefined,
  };
};

export const getCompanySettings = (companyId: string, company?: any): CompanySettings => {
  const defaults = getDefaultSettings(company);
  if (!companyId) return defaults;
  try {
    const fullKey = `tradeflow_company_settings_${companyId}`;
    const legacyKey = `tradeflow_bank_${companyId}`;

    let loaded: Partial<CompanySettings> = {};
    const fullData = localStorage.getItem(fullKey);
    if (fullData) {
      loaded = JSON.parse(fullData);
    }
    const legacyData = localStorage.getItem(legacyKey);
    if (legacyData) {
      const legacy = JSON.parse(legacyData);
      loaded = { ...legacy, ...loaded };
    }
    return { ...defaults, ...loaded };
  } catch {
    return defaults;
  }
};

export const saveCompanySettings = (companyId: string, settings: CompanySettings): void => {
  if (!companyId) return;
  const fullKey = `tradeflow_company_settings_${companyId}`;
  const legacyKey = `tradeflow_bank_${companyId}`;

  localStorage.setItem(fullKey, JSON.stringify(settings));
  // Keep legacy key synced for backwards compatibility
  localStorage.setItem(legacyKey, JSON.stringify({
    bankName: settings.bankName,
    accountNo: settings.accountNo,
    ifscCode: settings.ifscCode,
    branch: settings.branch,
    accountName: settings.accountName,
    signatureImage: settings.signatureImage,
  }));

  window.dispatchEvent(new CustomEvent('tradeflow_settings_updated', { detail: { companyId } }));
  window.dispatchEvent(new CustomEvent('tradeflow_bank_updated', { detail: { companyId } }));
};
