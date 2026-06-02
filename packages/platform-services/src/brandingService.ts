/**
 * brandingService - reads and writes the company_branding row for the current
 * user's company.
 *
 * Static fallbacks are package-owned so both web hosts resolve the same brand
 * contract even while app-local service shims remain for compatibility.
 */
import { supabase } from '@flc/supabase';

export const brandAssets = {
  compactLogo: '/icons/logo.png',
  fullLogo: '/icons/Fook Loi Corp (Sabah) Sdn. Bhd. Logo.png',
  whiteBackgroundLogo: '/icons/Fook Loi Logo_with white bg.png',
} as const;

export const brandName = 'Fook Loi Group UBS';

export interface CompanyBranding {
  id: string;
  company_id: string;
  company_name: string | null;
  legal_name: string | null;
  company_reg_no: string | null;
  app_name: string | null;
  app_short_name: string | null;
  logo_path: string | null;
  login_logo_path: string | null;
  favicon_path: string | null;
  address: string | null;
  support_email: string | null;
  support_phone: string | null;
  website: string | null;
  default_timezone: string | null;
  default_locale: string | null;
  accent_color: string | null;
  copyright_text: string | null;
  updated_at: string;
  created_at: string;
}

export type BrandingUpdateFields = Omit<
  CompanyBranding,
  'id' | 'company_id' | 'updated_at' | 'created_at'
>;

export interface ResolvedBranding {
  companyName: string;
  legalName: string;
  companyRegNo: string;
  appName: string;
  appShortName: string;
  logoUrl: string | null;
  loginLogoUrl: string | null;
  faviconUrl: string | null;
  address: string;
  supportEmail: string;
  supportPhone: string;
  website: string;
  defaultTimezone: string;
  defaultLocale: string;
  accentColor: string;
  copyrightText: string;
}

export const BRANDING_DEFAULTS: ResolvedBranding = {
  companyName: brandName,
  legalName: '',
  companyRegNo: '',
  appName: brandName,
  appShortName: 'FLC',
  logoUrl: brandAssets.compactLogo,
  loginLogoUrl: brandAssets.compactLogo,
  faviconUrl: brandAssets.compactLogo,
  address: '',
  supportEmail: '',
  supportPhone: '',
  website: '',
  defaultTimezone: 'Asia/Kuala_Lumpur',
  defaultLocale: 'en-MY',
  accentColor: '',
  copyrightText: `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`,
};

export async function fetchBranding(): Promise<{
  data: CompanyBranding | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('company_branding')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as CompanyBranding | null, error: null };
}

export async function saveBranding(
  companyId: string,
  fields: Partial<BrandingUpdateFields>,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('company_branding')
    .upsert(
      {
        company_id: companyId,
        ...fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' },
    );
  if (error) return { error: error.message };
  return { error: null };
}

export async function uploadBrandingAsset(
  companyId: string,
  slot: 'logo' | 'login_logo' | 'favicon',
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `${companyId}/${slot}.${ext}`;

  const { error } = await supabase.storage
    .from('company-assets')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

export async function getAssetUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from('company-assets')
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function resolveBranding(
  raw: CompanyBranding | null,
): Promise<ResolvedBranding> {
  if (!raw) return BRANDING_DEFAULTS;

  const [logoUrl, loginLogoUrl, faviconUrl] = await Promise.all([
    getAssetUrl(raw.logo_path),
    getAssetUrl(raw.login_logo_path),
    getAssetUrl(raw.favicon_path),
  ]);

  const year = new Date().getFullYear();
  const name = raw.company_name ?? BRANDING_DEFAULTS.companyName;

  return {
    companyName: raw.company_name ?? BRANDING_DEFAULTS.companyName,
    legalName: raw.legal_name ?? '',
    companyRegNo: raw.company_reg_no ?? '',
    appName: raw.app_name ?? BRANDING_DEFAULTS.appName,
    appShortName: raw.app_short_name ?? BRANDING_DEFAULTS.appShortName,
    logoUrl: logoUrl ?? BRANDING_DEFAULTS.logoUrl,
    loginLogoUrl: loginLogoUrl ?? BRANDING_DEFAULTS.loginLogoUrl,
    faviconUrl: faviconUrl ?? BRANDING_DEFAULTS.faviconUrl,
    address: raw.address ?? '',
    supportEmail: raw.support_email ?? '',
    supportPhone: raw.support_phone ?? '',
    website: raw.website ?? '',
    defaultTimezone: raw.default_timezone ?? BRANDING_DEFAULTS.defaultTimezone,
    defaultLocale: raw.default_locale ?? BRANDING_DEFAULTS.defaultLocale,
    accentColor: raw.accent_color ?? '',
    copyrightText: raw.copyright_text ?? `© ${year} ${name}. All rights reserved.`,
  };
}
