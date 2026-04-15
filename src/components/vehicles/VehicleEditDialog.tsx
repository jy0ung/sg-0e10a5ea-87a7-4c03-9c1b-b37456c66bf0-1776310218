import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VehicleCanonical } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { vehicleSchema, type VehicleFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

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
              { key: 'chassis_no', label: 'Chassis No' },
              { key: 'branch_code', label: 'Branch Code' },
              { key: 'model', label: 'Model' },
              { key: 'variant', label: 'Variant' },
              { key: 'customer_name', label: 'Customer Name' },
              { key: 'salesman_name', label: 'Salesman Name' },
              { key: 'payment_method', label: 'Payment Method' },
              { key: 'reg_no', label: 'Reg No' },
              { key: 'invoice_no', label: 'Invoice No' },
              { key: 'lou', label: 'LOU' },
              { key: 'contra_sola', label: 'Contra/Sola' },
              { key: 'obr', label: 'OBR' },
              { key: 'dealer_transfer_price', label: 'Dealer Transfer Price' },
              { key: 'full_payment_type', label: 'Full Payment Type' },
              { key: 'shipment_name', label: 'Shipment Name' },
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
              { key: 'bg_date', label: 'BG Date' },
              { key: 'shipment_etd_pkg', label: 'ETD (PKG)' },
              { key: 'shipment_eta_kk_twu_sdk', label: 'ETA (KK)' },
              { key: 'date_received_by_outlet', label: 'Outlet Recv Date' },
              { key: 'reg_date', label: 'Reg Date' },
              { key: 'delivery_date', label: 'Delivery Date' },
              { key: 'disb_date', label: 'Disbursement Date' },
              { key: 'vaa_date', label: 'VAA Date' },
              { key: 'full_payment_date', label: 'Full Payment Date' },
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
              <Label htmlFor="remark">Remark</Label>
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
              <Label htmlFor="is_d2d">D2D (Door to Door)</Label>
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
