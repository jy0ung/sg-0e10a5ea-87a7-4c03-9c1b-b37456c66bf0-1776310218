import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { createDeal, type CreateDealInput } from '@/services/dealService';

export default function NewDeal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateDealInput>({
    company_id: user?.company_id || '',
    customer_name: '',
    customer_ic: '',
    customer_phone: '',
    customer_email: '',
    model_name: '',
    variant: '',
    colour: '',
    selling_price: 0,
    deposit_amount: 0,
    discount_amount: 0,
    accessories_amount: 0,
    lead_source: '',
    lead_source_detail: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.customer_name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await createDeal({
        ...form,
        company_id: user.company_id,
        sales_advisor_id: user.id,
        sales_advisor_name: user.name || user.email,
      }, user.id);

      if (error) {
        toast.error('Failed to create deal');
        return;
      }

      toast.success('Deal created');
      navigate(`/sales/deals/${data!.id}`);
    } catch {
      toast.error('Failed to create deal');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = (form.selling_price || 0) - (form.discount_amount || 0) + (form.accessories_amount || 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/sales/deals')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title="New Deal" subtitle="Create a new deal" />
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Customer Name *</Label>
                <Input
                  value={form.customer_name}
                  onChange={(e) => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  placeholder="Full name"
                  required
                />
              </div>
              <div>
                <Label>IC Number</Label>
                <Input
                  value={form.customer_ic || ''}
                  onChange={(e) => setForm(f => ({ ...f, customer_ic: e.target.value }))}
                  placeholder="IC number"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.customer_phone || ''}
                  onChange={(e) => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                  placeholder="Phone number"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.customer_email || ''}
                  onChange={(e) => setForm(f => ({ ...f, customer_email: e.target.value }))}
                  placeholder="Email address"
                />
              </div>
            </CardContent>
          </Card>

          {/* Vehicle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vehicle Interest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Model</Label>
                <Input
                  value={form.model_name || ''}
                  onChange={(e) => setForm(f => ({ ...f, model_name: e.target.value }))}
                  placeholder="e.g., Proton X70"
                />
              </div>
              <div>
                <Label>Variant</Label>
                <Input
                  value={form.variant || ''}
                  onChange={(e) => setForm(f => ({ ...f, variant: e.target.value }))}
                  placeholder="e.g., 1.5 TGDI Premium"
                />
              </div>
              <div>
                <Label>Colour</Label>
                <Input
                  value={form.colour || ''}
                  onChange={(e) => setForm(f => ({ ...f, colour: e.target.value }))}
                  placeholder="e.g., Jet Grey"
                />
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Selling Price (RM)</Label>
                <Input
                  type="number"
                  value={form.selling_price || ''}
                  onChange={(e) => setForm(f => ({ ...f, selling_price: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Deposit (RM)</Label>
                <Input
                  type="number"
                  value={form.deposit_amount || ''}
                  onChange={(e) => setForm(f => ({ ...f, deposit_amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Discount (RM)</Label>
                <Input
                  type="number"
                  value={form.discount_amount || ''}
                  onChange={(e) => setForm(f => ({ ...f, discount_amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Accessories (RM)</Label>
                <Input
                  type="number"
                  value={form.accessories_amount || ''}
                  onChange={(e) => setForm(f => ({ ...f, accessories_amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              <div className="text-lg font-bold">
                Total: RM {totalAmount.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          {/* Source & Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Source & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Lead Source</Label>
                <Select value={form.lead_source || ''} onValueChange={(v) => setForm(f => ({ ...f, lead_source: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk_in">Walk-in</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="repeat">Repeat Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Source Details</Label>
                <Input
                  value={form.lead_source_detail || ''}
                  onChange={(e) => setForm(f => ({ ...f, lead_source_detail: e.target.value }))}
                  placeholder="e.g., Facebook ad, Ahmad referral"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes || ''}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" type="button" onClick={() => navigate('/sales/deals')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Create Deal
          </Button>
        </div>
      </form>
    </div>
  );
}
