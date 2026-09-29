import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { toast } from 'sonner';
import { saveBranding, uploadBrandingAsset, type ResolvedBranding } from '@flc/platform-services';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useBeforeUnloadWarning } from '@/hooks/useBeforeUnloadWarning';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { OrganizationBrandingSettings, type BrandingFields } from './settings/SettingsSections';

function fieldsFromBranding(branding: ResolvedBranding): BrandingFields {
  return {
    company_name: branding.companyName,
    legal_name: branding.legalName,
    company_reg_no: branding.companyRegNo,
    app_name: branding.appName,
    app_short_name: branding.appShortName,
    address: branding.address,
    support_email: branding.supportEmail,
    support_phone: branding.supportPhone,
    website: branding.website,
    copyright_text: branding.copyrightText,
  };
}

function sameFields(a: BrandingFields, b: BrandingFields): boolean {
  return (Object.keys(a) as (keyof BrandingFields)[]).every(key => a[key] === b[key]);
}

function OrganizationForAccount({ companyId }: { companyId: string | null }) {
  const { branding, loading, error: loadError, refresh } = useBranding();
  const [fields, setFields] = useState<BrandingFields>(() => fieldsFromBranding(branding));
  const savedFields = useRef<BrandingFields>(fields);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const loginLogoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const dirty = !sameFields(fields, savedFields.current);
  const pending = saving || uploadingSlot !== null;

  // A background refresh may update the displayed brand, but it cannot replace
  // an edit in progress. Once the draft matches the saved snapshot, it can sync.
  useEffect(() => {
    if (!sameFields(fields, savedFields.current)) return;
    const latest = fieldsFromBranding(branding);
    savedFields.current = latest;
    if (!sameFields(fields, latest)) setFields(latest);
  }, [branding, fields]);

  useBeforeUnloadWarning(dirty || pending);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (dirty || pending) && currentLocation.pathname !== nextLocation.pathname,
  );

  const handleSave = async () => {
    if (!companyId || !dirty || saving) return;
    const submitted = { ...fields };
    setSaving(true);
    try {
      const { error } = await saveBranding(companyId, {
        company_name: submitted.company_name || null,
        legal_name: submitted.legal_name || null,
        company_reg_no: submitted.company_reg_no || null,
        app_name: submitted.app_name || null,
        app_short_name: submitted.app_short_name || null,
        address: submitted.address || null,
        support_email: submitted.support_email || null,
        support_phone: submitted.support_phone || null,
        website: submitted.website || null,
        copyright_text: submitted.copyright_text || null,
      });
      if (error) throw new Error(error);
      savedFields.current = submitted;
      toast.success('Organization branding saved');
      refresh();
    } catch (error) {
      toast.error('Failed to save branding', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAssetUpload = async (slot: 'logo' | 'login_logo' | 'favicon', file: File) => {
    if (!companyId) return;
    setUploadingSlot(slot);
    try {
      const { error } = await uploadBrandingAsset(companyId, slot, file);
      if (error) throw new Error(error);
      toast.success('Brand asset uploaded');
      refresh();
    } catch (error) {
      toast.error('Failed to upload brand asset', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <div className="space-y-6 motion-safe:animate-fade-in">
      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved organization changes</AlertDialogTitle>
            <AlertDialogDescription>Your branding changes or upload may be lost if you leave this page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay and save</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PageHeader
        title="Organization & Branding"
        description="Manage the company name, contact details, and visual identity used across UBS."
        breadcrumbs={[{ label: 'FLC BI', path: '/' }, { label: 'Admin', path: '/admin' }, { label: 'Organization & Branding' }]}
      />
      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">Loading organization branding...</p>
      ) : loadError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm" role="alert">
          <p className="font-medium">Organization branding could not be loaded.</p>
          <p className="mt-1 text-muted-foreground">{loadError}</p>
          <button type="button" className="mt-3 font-medium text-primary underline" onClick={refresh}>Try again</button>
        </div>
      ) : (
        <OrganizationBrandingSettings
          branding={branding}
          brandingFields={fields}
          brandingDirty={dirty}
          savingBranding={saving}
          uploadingSlot={uploadingSlot}
          logoInputRef={logoInputRef}
          loginLogoInputRef={loginLogoInputRef}
          faviconInputRef={faviconInputRef}
          setBrandingFields={setFields}
          onSaveBranding={handleSave}
          onAssetUpload={handleAssetUpload}
        />
      )}
    </div>
  );
}

export default function AdminOrganization() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  // A different account must never inherit the previous account's draft.
  return <OrganizationForAccount key={`${user?.id ?? 'guest'}:${companyId ?? 'none'}`} companyId={companyId} />;
}
