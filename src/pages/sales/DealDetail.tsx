import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  FileText,
  History,
  Car,
  CreditCard,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  getDeal,
  updateDeal,
  advanceStage,
  setupLoan,
  updateLoanStatus,
  setupInsurance,
  setupRegistration,
  getActivities,
  getValidTransitions,
  getStageLabel,
  getStageOrder,
  getResponsibleParty,
  getNextAction,
  type Deal,
  type DealStage,
  type DealActivity,
  type LoanStatus,
} from '@/services/dealService';

const STAGE_ORDER = getStageOrder();

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Deal>>({});

  const loadDeal = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await getDeal(id);
      if (error) {
        toast.error('Failed to load deal');
        navigate('/sales/deals');
        return;
      }
      setDeal(data);
      setEditForm(data || {});
    } catch {
      toast.error('Failed to load deal');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const loadActivities = useCallback(async () => {
    if (!id) return;
    const { data } = await getActivities(id);
    setActivities(data);
  }, [id]);

  useEffect(() => {
    loadDeal();
    loadActivities();
  }, [loadDeal, loadActivities]);

  const handleSave = async () => {
    if (!deal || !user) return;
    setSaving(true);
    try {
      const { data, error } = await updateDeal(deal.id, editForm, user.id);
      if (error) {
        toast.error('Failed to save changes');
        return;
      }
      setDeal(data);
      setEditing(false);
      toast.success('Deal updated');
      loadActivities();
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleAdvanceStage = async (targetStage: DealStage) => {
    if (!deal || !user) return;
    setSaving(true);
    try {
      const { data, error } = await advanceStage(deal.id, targetStage, user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setDeal(data);
      toast.success(`Stage advanced to ${getStageLabel(targetStage)}`);
      loadActivities();
    } catch {
      toast.error('Failed to advance stage');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Deal not found</p>
        <Button variant="link" onClick={() => navigate('/sales/deals')}>
          Back to deals
        </Button>
      </div>
    );
  }

  const validTransitions = getValidTransitions(deal.stage as DealStage);
  const currentStageIndex = STAGE_ORDER.indexOf(deal.stage as DealStage);
  const daysInStage = Math.floor(
    (Date.now() - new Date(deal.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/sales/deals')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{deal.deal_no}</h1>
            <p className="text-muted-foreground">
              {deal.vso_no && `VSO: ${deal.vso_no} · `}
              Created {new Date(deal.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant="default" className="text-sm">{getStageLabel(deal.stage as DealStage)}</Badge>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-sm text-muted-foreground">Responsible</p>
              <p className="font-medium">{getResponsibleParty(deal.stage as DealStage)}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-sm text-muted-foreground">Next Action</p>
              <p className="font-medium">{getNextAction(deal.stage as DealStage)}</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-sm text-muted-foreground">Days in Stage</p>
              <p className={`font-medium ${daysInStage > 7 ? 'text-destructive' : ''}`}>
                {daysInStage} days
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow Strip */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STAGE_ORDER.map((stage, index) => {
          const isActive = deal.stage === stage;
          const isPast = index < currentStageIndex;
          return (
            <div key={stage} className="flex items-center">
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isPast
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <span>{index + 1}</span>
                <span className="hidden sm:inline">{getStageLabel(stage as DealStage)}</span>
              </div>
              {index < STAGE_ORDER.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      {validTransitions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {validTransitions.map(target => (
            <Button
              key={target}
              size="sm"
              onClick={() => handleAdvanceStage(target)}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Advance to {getStageLabel(target)}
            </Button>
          ))}
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="loan">Loan</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="registration">Registration</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Customer Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Customer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  {editing ? (
                    <Input
                      value={editForm.customer_name || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                    />
                  ) : (
                    <p className="font-medium">{deal.customer_name}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">IC No</Label>
                  {editing ? (
                    <Input
                      value={editForm.customer_ic || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, customer_ic: e.target.value }))}
                    />
                  ) : (
                    <p>{deal.customer_ic || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  {editing ? (
                    <Input
                      value={editForm.customer_phone || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, customer_phone: e.target.value }))}
                    />
                  ) : (
                    <p>{deal.customer_phone || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  {editing ? (
                    <Input
                      value={editForm.customer_email || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, customer_email: e.target.value }))}
                    />
                  ) : (
                    <p>{deal.customer_email || '—'}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Vehicle Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Vehicle
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Model</Label>
                  {editing ? (
                    <Input
                      value={editForm.model_name || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, model_name: e.target.value }))}
                    />
                  ) : (
                    <p className="font-medium">{deal.model_name || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Variant</Label>
                  {editing ? (
                    <Input
                      value={editForm.variant || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, variant: e.target.value }))}
                    />
                  ) : (
                    <p>{deal.variant || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Colour</Label>
                  {editing ? (
                    <Input
                      value={editForm.colour || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, colour: e.target.value }))}
                    />
                  ) : (
                    <p>{deal.colour || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Chassis No</Label>
                  <p>{deal.chassis_no || 'Pending allocation'}</p>
                </div>
              </CardContent>
            </Card>

            {/* Pricing Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Pricing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Selling Price</Label>
                  {editing ? (
                    <Input
                      type="number"
                      value={editForm.selling_price || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, selling_price: parseFloat(e.target.value) || 0 }))}
                    />
                  ) : (
                    <p className="font-medium">RM {(deal.selling_price || 0).toLocaleString()}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Deposit</Label>
                  {editing ? (
                    <Input
                      type="number"
                      value={editForm.deposit_amount || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, deposit_amount: parseFloat(e.target.value) || 0 }))}
                    />
                  ) : (
                    <p>RM {(deal.deposit_amount || 0).toLocaleString()}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Discount</Label>
                  {editing ? (
                    <Input
                      type="number"
                      value={editForm.discount_amount || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, discount_amount: parseFloat(e.target.value) || 0 }))}
                    />
                  ) : (
                    <p>RM {(deal.discount_amount || 0).toLocaleString()}</p>
                  )}
                </div>
                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground">Total</Label>
                  <p className="text-lg font-bold">RM {(deal.total_amount || 0).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Add notes..."
                />
              ) : (
                <p className="text-muted-foreground">{deal.notes || 'No notes'}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loan Tab */}
        <TabsContent value="loan">
          <LoanTab deal={deal} onUpdate={loadDeal} />
        </TabsContent>

        {/* Insurance Tab */}
        <TabsContent value="insurance">
          <InsuranceTab deal={deal} onUpdate={loadDeal} />
        </TabsContent>

        {/* Registration Tab */}
        <TabsContent value="registration">
          <RegistrationTab deal={deal} onUpdate={loadDeal} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <DocumentsTab deal={deal} />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <ActivityTab activities={activities} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Sub-Track Tabs
// ============================================================

function LoanTab({ deal, onUpdate }: { deal: Deal; onUpdate: () => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const loan = deal.deal_loan;
  const [form, setForm] = useState({
    bank_name: loan?.bank_name || '',
    loan_type: loan?.loan_type || 'hire_purchase',
    loan_amount: loan?.loan_amount?.toString() || '',
    loan_tenure_months: loan?.loan_tenure_months?.toString() || '',
    monthly_installment: loan?.monthly_installment?.toString() || '',
    interest_rate: loan?.interest_rate?.toString() || '',
    notes: loan?.notes || '',
  });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await setupLoan(deal.id, deal.company_id, {
        ...form,
        loan_amount: parseFloat(form.loan_amount) || null,
        loan_tenure_months: parseInt(form.loan_tenure_months) || null,
        monthly_installment: parseFloat(form.monthly_installment) || null,
        interest_rate: parseFloat(form.interest_rate) || null,
      }, user.id);
      if (error) {
        toast.error('Failed to save loan');
        return;
      }
      toast.success('Loan saved');
      onUpdate();
    } catch {
      toast.error('Failed to save loan');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: LoanStatus) => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await updateLoanStatus(deal.id, deal.company_id, status, user.id);
      if (error) {
        toast.error('Failed to update status');
        return;
      }
      toast.success(`Loan status: ${status}`);
      onUpdate();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Loan Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Bank</Label>
            <Input value={form.bank_name} onChange={(e) => setForm(f => ({ ...f, bank_name: e.target.value }))} />
          </div>
          <div>
            <Label>Loan Type</Label>
            <Select value={form.loan_type} onValueChange={(v) => setForm(f => ({ ...f, loan_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hire_purchase">Hire Purchase</SelectItem>
                <SelectItem value="conventional">Conventional</SelectItem>
                <SelectItem value="islamic">Islamic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Loan Amount (RM)</Label>
            <Input type="number" value={form.loan_amount} onChange={(e) => setForm(f => ({ ...f, loan_amount: e.target.value }))} />
          </div>
          <div>
            <Label>Tenure (months)</Label>
            <Input type="number" value={form.loan_tenure_months} onChange={(e) => setForm(f => ({ ...f, loan_tenure_months: e.target.value }))} />
          </div>
          <div>
            <Label>Monthly Installment (RM)</Label>
            <Input type="number" value={form.monthly_installment} onChange={(e) => setForm(f => ({ ...f, monthly_installment: e.target.value }))} />
          </div>
          <div>
            <Label>Interest Rate (%)</Label>
            <Input type="number" value={form.interest_rate} onChange={(e) => setForm(f => ({ ...f, interest_rate: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex items-center justify-between">
          <Badge variant="outline">Status: {loan?.status || 'Not set up'}</Badge>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              Save
            </Button>
            {(!loan || loan.status === 'pending') && (
              <Button size="sm" onClick={() => handleStatusChange('submitted')} disabled={saving}>
                Submit to Bank
              </Button>
            )}
            {loan?.status === 'submitted' && (
              <>
                <Button size="sm" variant="default" onClick={() => handleStatusChange('approved')} disabled={saving}>
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleStatusChange('rejected')} disabled={saving}>
                  Reject
                </Button>
              </>
            )}
            {loan?.status === 'approved' && (
              <Button size="sm" onClick={() => handleStatusChange('lou_issued')} disabled={saving}>
                LOU Received
              </Button>
            )}
            {loan?.status === 'lou_issued' && (
              <Button size="sm" onClick={() => handleStatusChange('lou_verified')} disabled={saving}>
                Verify LOU
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsuranceTab({ deal, onUpdate }: { deal: Deal; onUpdate: () => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const insurance = deal.deal_insurance;
  const [form, setForm] = useState({
    insurer_name: insurance?.insurer_name || '',
    policy_no: insurance?.policy_no || '',
    cover_note_no: insurance?.cover_note_no || '',
    premium: insurance?.premium?.toString() || '',
    coverage_type: insurance?.coverage_type || 'comprehensive',
    notes: insurance?.notes || '',
  });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await setupInsurance(deal.id, deal.company_id, {
        ...form,
        premium: parseFloat(form.premium) || null,
      }, user.id);
      if (error) {
        toast.error('Failed to save insurance');
        return;
      }
      toast.success('Insurance saved');
      onUpdate();
    } catch {
      toast.error('Failed to save insurance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Insurance Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Insurer</Label>
            <Input value={form.insurer_name} onChange={(e) => setForm(f => ({ ...f, insurer_name: e.target.value }))} />
          </div>
          <div>
            <Label>Coverage Type</Label>
            <Select value={form.coverage_type} onValueChange={(v) => setForm(f => ({ ...f, coverage_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comprehensive">Comprehensive</SelectItem>
                <SelectItem value="third_party">Third Party</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Policy No</Label>
            <Input value={form.policy_no} onChange={(e) => setForm(f => ({ ...f, policy_no: e.target.value }))} />
          </div>
          <div>
            <Label>Cover Note No</Label>
            <Input value={form.cover_note_no} onChange={(e) => setForm(f => ({ ...f, cover_note_no: e.target.value }))} />
          </div>
          <div>
            <Label>Premium (RM)</Label>
            <Input type="number" value={form.premium} onChange={(e) => setForm(f => ({ ...f, premium: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex items-center justify-between">
          <Badge variant="outline">Status: {insurance?.status || 'Not set up'}</Badge>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RegistrationTab({ deal, onUpdate }: { deal: Deal; onUpdate: () => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const registration = deal.deal_registration;
  const [form, setForm] = useState({
    jpj_ref: registration?.jpj_ref || '',
    plate_no: registration?.plate_no || '',
    registration_date: registration?.registration_date || '',
    road_tax_expiry: registration?.road_tax_expiry || '',
    notes: registration?.notes || '',
  });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await setupRegistration(deal.id, deal.company_id, form, user.id);
      if (error) {
        toast.error('Failed to save registration');
        return;
      }
      toast.success('Registration saved');
      onUpdate();
    } catch {
      toast.error('Failed to save registration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registration Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>JPJ Reference</Label>
            <Input value={form.jpj_ref} onChange={(e) => setForm(f => ({ ...f, jpj_ref: e.target.value }))} />
          </div>
          <div>
            <Label>Plate Number</Label>
            <Input value={form.plate_no} onChange={(e) => setForm(f => ({ ...f, plate_no: e.target.value }))} />
          </div>
          <div>
            <Label>Registration Date</Label>
            <Input type="date" value={form.registration_date} onChange={(e) => setForm(f => ({ ...f, registration_date: e.target.value }))} />
          </div>
          <div>
            <Label>Road Tax Expiry</Label>
            <Input type="date" value={form.road_tax_expiry} onChange={(e) => setForm(f => ({ ...f, road_tax_expiry: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex items-center justify-between">
          <Badge variant="outline">Status: {registration?.status || 'Not set up'}</Badge>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentsTab({ deal }: { deal: Deal }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DealDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("other");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const { data } = await getDocuments(deal.id);
    setDocuments(data);
    setLoading(false);
  }, [deal.id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const { error } = await uploadDocument(deal.id, deal.company_id, user.id, docType, file);
      if (error) {
        toast.error("Failed to upload document");
        return;
      }
      toast.success("Document uploaded");
      loadDocuments();
    } catch {
      toast.error("Failed to upload document");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Documents ({documents.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ic_copy">IC Copy</SelectItem>
                <SelectItem value="license">License</SelectItem>
                <SelectItem value="deposit_receipt">Deposit Receipt</SelectItem>
                <SelectItem value="loan_form">Loan Form</SelectItem>
                <SelectItem value="lou">LOU</SelectItem>
                <SelectItem value="insurance">Insurance</SelectItem>
                <SelectItem value="registration">Registration</SelectItem>
                <SelectItem value="delivery_signoff">Delivery Sign-off</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <input id="deal-doc-upload" type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            <Button size="sm" disabled={uploading} onClick={() => document.getElementById("deal-doc-upload")?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Upload
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No documents uploaded</p>
            <p className="text-sm">Upload IC, license, loan forms, insurance docs, etc.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.doc_type.replace(/_/g, " ")} · {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge variant="outline">{doc.doc_type.replace(/_/g, " ")}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityTab({ activities }: { activities: DealActivity[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activity yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map(activity => (
              <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="flex-1">
                  <p className="font-medium text-sm">{activity.action.replace(/_/g, ' ')}</p>
                  {activity.metadata && (
                    <pre className="text-xs text-muted-foreground mt-1">
                      {JSON.stringify(activity.metadata, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(activity.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
