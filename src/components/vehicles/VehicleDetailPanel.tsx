import React, { useState, useEffect } from 'react';
import { VehicleCanonical } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDate } from '@/lib/utils';
import { Edit2, Eye, Save, X, Clock, History } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { getAuditLog, type AuditLogWithProfile } from '@/services/auditService';

interface VehicleDetailPanelProps {
  vehicle: VehicleCanonical | null;
  open: boolean;
  onClose: () => void;
  canEdit?: boolean;
  onEdit?: (id: string, updates: Partial<VehicleCanonical>) => Promise<void>;
}

export function VehicleDetailPanel({ 
  vehicle, 
  open, 
  onClose, 
  canEdit = false, 
  onEdit 
}: VehicleDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<VehicleCanonical>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogWithProfile[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    if (vehicle && open) {
      setEditData(vehicle);
      // Load audit logs
      loadAuditLogs(vehicle.id);
    }
  }, [vehicle, open]);

  const loadAuditLogs = async (vehicleId: string) => {
    setLoadingAudit(true);
    const { data } = await getAuditLog(vehicleId, 50);
    setAuditLogs(data || []);
    setLoadingAudit(false);
  };

  const handleSave = async () => {
    if (!vehicle || !onEdit) return;
    
    setIsSaving(true);
    await onEdit(vehicle.id, editData);
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(vehicle || {});
    setIsEditing(false);
  };

  if (!vehicle || !open) return null;

  const sections = [
    {
      id: 'basic',
      title: 'Basic Information',
      fields: [
        { key: 'chassis_no', label: 'Chassis No', type: 'text', readonly: true },
        { key: 'model', label: 'Model', type: 'text', readonly: true },
        { key: 'variant', label: 'Variant', type: 'text' },
        { key: 'branch_code', label: 'Branch', type: 'text' },
        { key: 'customer_name', label: 'Customer Name', type: 'text' },
        { key: 'salesman_name', label: 'Salesman Name', type: 'text' },
        { key: 'reg_no', label: 'Registration No', type: 'text' },
        { key: 'invoice_no', label: 'Invoice No', type: 'text' },
      ],
    },
    {
      id: 'dates',
      title: 'Important Dates',
      fields: [
        { key: 'bg_date', label: 'BG Date', type: 'date' },
        { key: 'etd_pkg', label: 'ETD (PKG)', type: 'date' },
        { key: 'eta_kk', label: 'ETA (KK)', type: 'date' },
        { key: 'outlet_recv_date', label: 'Outlet Received', type: 'date' },
        { key: 'reg_date', label: 'Registration Date', type: 'date' },
        { key: 'delivery_date', label: 'Delivery Date', type: 'date' },
        { key: 'disb_date', label: 'Disbursement Date', type: 'date' },
        { key: 'full_payment_date', label: 'Full Payment Date', type: 'date' },
        { key: 'vaa_date', label: 'VAA Date', type: 'date' },
      ],
    },
    {
      id: 'financials',
      title: 'Financial Information',
      fields: [
        { key: 'dealer_transfer_price', label: 'Dealer Transfer Price', type: 'number' },
        { key: 'lou_amount', label: 'LOU Amount', type: 'number' },
        { key: 'payment_method', label: 'Payment Method', type: 'text' },
        { key: 'full_payment_type', label: 'Full Payment Type', type: 'text' },
        { key: 'contra_sola', label: 'Contra/SOLA', type: 'text' },
        { key: 'obr', label: 'OBR', type: 'text' },
      ],
    },
    {
      id: 'logistics',
      title: 'Logistics Information',
      fields: [
        { key: 'shipment_name', label: 'Shipment Name', type: 'text' },
        { key: 'd2d', label: 'D2D', type: 'text' },
        { key: 'remark', label: 'Remark', type: 'textarea' },
      ],
    },
  ];

  const renderField = (field: any) => {
    const value = editData[field.key as keyof VehicleCanonical];
    const isReadOnly = !isEditing || field.readonly;

    if (field.type === 'textarea') {
      return (
        <Textarea
          value={value as string || ''}
          onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
          disabled={isReadOnly}
          className="min-h-[80px]"
        />
      );
    }

    if (field.type === 'number') {
      return (
        <Input
          type="number"
          value={value as number || ''}
          onChange={(e) => setEditData({ ...editData, [field.key]: parseFloat(e.target.value) || 0 })}
          disabled={isReadOnly}
        />
      );
    }

    if (field.type === 'date') {
      return (
        <Input
          type="date"
          value={value ? value.toString().split('T')[0] : ''}
          onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
          disabled={isReadOnly}
        />
      );
    }

    return (
      <Input
        type="text"
        value={value as string || ''}
        onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
        disabled={isReadOnly}
      />
    );
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex justify-end">
      <Card className="w-full max-w-4xl h-full shadow-2xl border-l border-border">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-2xl font-bold">Vehicle Details</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{vehicle.model}</Badge>
                <Badge variant="outline">{vehicle.branch_code}</Badge>
                <StatusBadge status={(vehicle.bg_to_delivery ?? 0) > 45 ? 'warning' : 'active'} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && !isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4 mr-2" />Edit
                </Button>
              )}
              {isEditing && (
                <>
                  <Button variant="outline" size="sm" onClick={handleCancel}>
                    <X className="h-4 w-4 mr-2" />Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />{isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <Tabs defaultValue="details" className="h-full flex flex-col">
            <TabsList>
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Audit Log
                {auditLogs.length > 0 && <Badge variant="secondary" className="ml-1">{auditLogs.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-6 pb-4">
                  {sections.map((section) => (
                    <Card key={section.id} className="border border-border/50">
                      <CardHeader>
                        <CardTitle className="text-sm font-semibold">{section.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          {section.fields.map((field) => (
                            <div key={field.key} className="space-y-2">
                              <Label className="text-xs text-muted-foreground">{field.label}</Label>
                              {renderField(field)}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="audit" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full pr-4">
                {loadingAudit ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No audit history available</p>
                  </div>
                ) : (
                  <div className="space-y-4 pb-4">
                    {auditLogs.map((log) => (
                      <Card key={log.id} className="border border-border/50">
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between mb-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {log.profiles?.full_name || 'Unknown User'}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {log.profiles?.role || 'user'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDate(log.created_at, 'PPpp')}
                              </p>
                            </div>
                            <Badge variant={log.action === 'update' ? 'default' : 'secondary'}>
                              {log.action.toUpperCase()}
                            </Badge>
                          </div>
                          {log.changes && Object.keys(log.changes).length > 0 && (
                            <div className="space-y-2">
                              {Object.entries(log.changes).map(([key, change]) => {
                                const typedChange = change as { before: unknown; after: unknown };
                                return (
                                  <div key={key} className="bg-secondary/30 rounded p-3 space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground uppercase">{key}</p>
                                    <div className="flex gap-4 text-xs">
                                      <div className="flex-1">
                                        <span className="text-destructive">Before:</span>{' '}
                                        <span className="text-muted-foreground">
                                          {String(typedChange.before || '—')}
                                        </span>
                                      </div>
                                      <div className="flex-1">
                                        <span className="text-success">After:</span>{' '}
                                        <span className="text-foreground">
                                          {String(typedChange.after || '—')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}