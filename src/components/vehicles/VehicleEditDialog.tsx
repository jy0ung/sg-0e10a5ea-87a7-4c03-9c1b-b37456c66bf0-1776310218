import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { VehicleCanonical } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { vehicleSchema, type VehicleFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VEHICLE_STAGES, VEHICLE_STAGE_LABELS } from '@/utils/vehicleStage';
import { getAutoAgingFieldLabel } from '@/config/autoAgingFieldLabels';

interface VehicleEditDialogProps {
  vehicle: VehicleCanonical | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function VehicleEditDialog({ vehicle, open, onOpenChange, onSaved }: VehicleEditDialogProps) {
  const form = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      chassis_no: vehicle?.chassis_no || '',
      branch_code: vehicle?.branch_code || '',
      model: vehicle?.model || '',
      variant: vehicle?.variant || null,
      color: vehicle?.color || null,
      customer_name: vehicle?.customer_name || '',
      salesman_name: vehicle?.salesman_name || '',
      payment_method: vehicle?.payment_method || '',
      bg_date: vehicle?.bg_date || null,
      shipment_etd_pkg: vehicle?.shipment_etd_pkg || null,
      shipment_eta_kk_twu_sdk: vehicle?.shipment_eta_kk_twu_sdk || null,
      date_received_by_outlet: vehicle?.date_received_by_outlet || null,
      reg_date: vehicle?.reg_date || null,
      delivery_date: vehicle?.delivery_date || null,
      disb_date: vehicle?.disb_date || null,
      vaa_date: vehicle?.vaa_date || null,
      full_payment_date: vehicle?.full_payment_date || null,
      reg_no: vehicle?.reg_no || null,
      invoice_no: vehicle?.invoice_no || null,
      lou: vehicle?.lou || null,
      contra_sola: vehicle?.contra_sola || null,
      obr: vehicle?.obr || null,
      dealer_transfer_price: vehicle?.dealer_transfer_price || null,
      full_payment_type: vehicle?.full_payment_type || null,
      shipment_name: vehicle?.shipment_name || null,
      remark: vehicle?.remark || null,
      is_d2d: vehicle?.is_d2d,
      commission_paid: vehicle?.commission_paid ?? null,
      commission_remark: vehicle?.commission_remark || null,
      stage_override: vehicle?.stage_override ?? null,
    },
    mode: 'onChange',
  });

  const handleSubmit = (data: VehicleFormData) => {
    onSaved(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Vehicle — {vehicle?.chassis_no}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="grid grid-cols-2 gap-4 py-4">
            {[
              { key: 'chassis_no', label: getAutoAgingFieldLabel('chassis_no', 'CHASSIS NO.') },
              { key: 'branch_code', label: getAutoAgingFieldLabel('branch_code', 'BRCH K1') },
              { key: 'model', label: getAutoAgingFieldLabel('model', 'MODEL') },
              { key: 'variant', label: getAutoAgingFieldLabel('variant', 'VAR') },
              { key: 'color', label: getAutoAgingFieldLabel('color', 'COLOR') },
              { key: 'customer_name', label: getAutoAgingFieldLabel('customer_name', 'CUST NAME') },
              { key: 'salesman_name', label: getAutoAgingFieldLabel('salesman_name', 'SA NAME') },
              { key: 'payment_method', label: getAutoAgingFieldLabel('payment_method', 'PAYMENT METHOD') },
              { key: 'reg_no', label: getAutoAgingFieldLabel('reg_no', 'REG NO') },
              { key: 'invoice_no', label: getAutoAgingFieldLabel('invoice_no', 'INV No.') },
              { key: 'lou', label: getAutoAgingFieldLabel('lou', 'LOU') },
              { key: 'contra_sola', label: getAutoAgingFieldLabel('contra_sola', 'CONTRA SOLA') },
              { key: 'obr', label: getAutoAgingFieldLabel('obr', 'OBR') },
              { key: 'dealer_transfer_price', label: getAutoAgingFieldLabel('dealer_transfer_price', 'DTP (DEALER TRANSFER PRICE)') },
              { key: 'full_payment_type', label: getAutoAgingFieldLabel('full_payment_type', 'FULL PAYMENT TYPE') },
              { key: 'shipment_name', label: getAutoAgingFieldLabel('shipment_name', 'SHIPMENT NAME') },
            ].map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  {...form.register(field.key as keyof VehicleFormData)}
                  className={form.formState.errors[field.key as keyof VehicleFormData] ? 'border-destructive' : ''}
                />
                {form.formState.errors[field.key as keyof VehicleFormData] && (
                  <p className="text-destructive text-xs">{form.formState.errors[field.key as keyof VehicleFormData]?.message}</p>
                )}
              </div>
            ))}

            {[
              { key: 'bg_date', label: getAutoAgingFieldLabel('bg_date', 'BG DATE') },
              { key: 'shipment_etd_pkg', label: getAutoAgingFieldLabel('shipment_etd_pkg', 'SHIPMENT ETD PKG') },
              { key: 'shipment_eta_kk_twu_sdk', label: getAutoAgingFieldLabel('shipment_eta_kk_twu_sdk', 'DATE SHIPMENT ETA KK/TWU/SDK') },
              { key: 'date_received_by_outlet', label: getAutoAgingFieldLabel('date_received_by_outlet', 'RECEIVED BY OUTLET') },
              { key: 'reg_date', label: getAutoAgingFieldLabel('reg_date', 'REG DATE') },
              { key: 'delivery_date', label: getAutoAgingFieldLabel('delivery_date', 'DELIVERY DATE') },
              { key: 'disb_date', label: getAutoAgingFieldLabel('disb_date', 'DISB. DATE') },
              { key: 'vaa_date', label: getAutoAgingFieldLabel('vaa_date', 'VAA DATE') },
              { key: 'full_payment_date', label: getAutoAgingFieldLabel('full_payment_date', 'FULL PAYMENT DATE') },
            ].map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type="date"
                  {...form.register(field.key as keyof VehicleFormData)}
                  className={form.formState.errors[field.key as keyof VehicleFormData] ? 'border-destructive' : ''}
                />
                {form.formState.errors[field.key as keyof VehicleFormData] && (
                  <p className="text-destructive text-xs">{form.formState.errors[field.key as keyof VehicleFormData]?.message}</p>
                )}
              </div>
            ))}

            <div className="col-span-2 space-y-1">
              <Label htmlFor="remark">{getAutoAgingFieldLabel('remark', 'REMARK')}</Label>
              <Textarea
                id="remark"
                {...form.register('remark')}
                rows={3}
                className={form.formState.errors.remark ? 'border-destructive' : ''}
              />
              {form.formState.errors.remark && (
                <p className="text-destructive text-xs">{form.formState.errors.remark.message}</p>
              )}
            </div>

            <div className="col-span-2 flex items-center space-x-2">
              <Checkbox
                id="is_d2d"
                checked={form.watch('is_d2d')}
                onCheckedChange={(checked) => form.setValue('is_d2d', checked === true)}
              />
              <Label htmlFor="is_d2d">{getAutoAgingFieldLabel('is_d2d', 'D2D')}</Label>
            </div>

            <div className="col-span-2 flex items-center space-x-2">
              <Checkbox
                id="commission_paid"
                checked={form.watch('commission_paid') === true}
                onCheckedChange={(checked) => form.setValue('commission_paid', checked === true)}
              />
              <Label htmlFor="commission_paid">{getAutoAgingFieldLabel('commission_paid', 'COMM PAYOUT')}</Label>
            </div>

            <div className="col-span-2 space-y-1">
              <Label htmlFor="commission_remark">{getAutoAgingFieldLabel('commission_remark', 'COMM REMARK')}</Label>
              <Input
                id="commission_remark"
                placeholder='e.g. "Comm not paid", "Paid 15/04"'
                {...form.register('commission_remark')}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label htmlFor="stage_override">Stage override</Label>
              <Select
                value={form.watch('stage_override') ?? '__auto__'}
                onValueChange={(v) =>
                  form.setValue(
                    'stage_override',
                    v === '__auto__' ? null : (v as VehicleFormData['stage_override']),
                  )
                }
              >
                <SelectTrigger id="stage_override">
                  <SelectValue placeholder="Auto (derive from dates)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (derive from dates)</SelectItem>
                  {VEHICLE_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{VEHICLE_STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pin this vehicle to a specific stage. Leave on Auto to follow milestone dates.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.formState.isValid}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
