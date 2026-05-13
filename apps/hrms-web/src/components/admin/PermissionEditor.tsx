import React, { useState, useEffect, useCallback } from 'react';
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { loggingService } from '@/services/loggingService';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  getUserPermissions, 
  setUserColumnPermissions,
  getUserColumnPermissions 
} from '@/services/permissionService';
import { useAuth } from '@/contexts/AuthContext';
import { User, Save, Eye, EyeOff, Edit, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { columnPermissionSchema, type ColumnPermissionFormData } from '@/lib/validations';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

interface PermissionEditorProps {
  userId: string;
  userName: string;
  userRole: string;
  onSave?: () => void;
  onCancel?: () => void;
}

const EXCEL_COLUMNS = [
  { key: 'chassis_no', label: 'CHASSIS NO.' },
  { key: 'branch_code', label: 'BRCH K1' },
  { key: 'vaa_date', label: 'VAA DATE' },
  { key: 'model', label: 'MODEL' },
  { key: 'variant', label: 'VAR' },
  { key: 'color', label: 'COLOR' },
  { key: 'dealer_transfer_price', label: 'DTP (DEALER TRANSFER PRICE)' },
  { key: 'payment_method', label: 'PAYMENT METHOD' },
  { key: 'bg_date', label: 'BG DATE' },
  { key: 'full_payment_type', label: 'FULL PAYMENT TYPE' },
  { key: 'full_payment_date', label: 'FULL PAYMENT DATE' },
  { key: 'shipment_name', label: 'SHIPMENT NAME' },
  { key: 'shipment_etd_pkg', label: 'SHIPMENT ETD PKG' },
  { key: 'shipment_eta_kk_twu_sdk', label: 'DATE SHIPMENT ETA KK/TWU/SDK' },
  { key: 'date_received_by_outlet', label: 'RECEIVED BY OUTLET' },
  { key: 'salesman_name', label: 'SA NAME' },
  { key: 'customer_name', label: 'CUST NAME' },
  { key: 'lou', label: 'LOU' },
  { key: 'contra_sola', label: 'CONTRA SOLA' },
  { key: 'reg_no', label: 'REG NO' },
  { key: 'reg_date', label: 'REG DATE' },
  { key: 'invoice_no', label: 'INV No.' },
  { key: 'obr', label: 'OBR' },
  { key: 'delivery_date', label: 'DELIVERY DATE' },
  { key: 'disb_date', label: 'DISB. DATE' },
  { key: 'commission_paid', label: 'COMM PAYOUT' },
  { key: 'commission_remark', label: 'COMM REMARK' },
  { key: 'is_d2d', label: 'D2D' },
  { key: 'remark', label: 'REMARK' },
];

type PermissionLevel = 'none' | 'view' | 'edit';

const PERMISSION_TEMPLATES = {
  full: EXCEL_COLUMNS.map(c => ({ column_name: c.key, permission_level: 'edit' as const })),
  readonly: EXCEL_COLUMNS.map(c => ({ column_name: c.key, permission_level: 'view' as const })),
  sales: EXCEL_COLUMNS
    .filter(c => ['chassis_no', 'branch_code', 'model', 'variant', 'color', 'customer_name', 'salesman_name', 'bg_date', 'delivery_date', 'lou', 'is_d2d', 'remark'].includes(c.key))
    .map(c => ({ column_name: c.key, permission_level: 'view' as const })),
  accounts: EXCEL_COLUMNS
    .filter(c => ['chassis_no', 'branch_code', 'dealer_transfer_price', 'payment_method', 'full_payment_type', 'full_payment_date', 'lou', 'contra_sola', 'invoice_no', 'obr', 'delivery_date', 'disb_date', 'commission_paid', 'commission_remark'].includes(c.key))
    .map(c => ({ column_name: c.key, permission_level: 'view' as const })),
};

export function PermissionEditor({ userId, userName, userRole, onSave, onCancel }: PermissionEditorProps) {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const form = useForm<ColumnPermissionFormData>({
    resolver: zodResolver(columnPermissionSchema),
    defaultValues: {
      column_key: '',
      permission_level: 'none',
    },
  });

  // Global permissions
  const [canEdit, setCanEdit] = useState(false);
  const [canBulkEdit, setCanBulkEdit] = useState(false);
  const [canViewDetails, setCanViewDetails] = useState(true);

  // Column permissions
  const [columnPermissions, setColumnPermissions] = useState<Record<string, PermissionLevel>>({});

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getUserPermissions(userId);
      setCanEdit(result.canEdit);
      setCanBulkEdit(result.canBulkEdit);
      setCanViewDetails(result.canViewDetails);

      const columnPerms = await getUserColumnPermissions(userId);
      if (columnPerms.length > 0) {
        const perms: Record<string, PermissionLevel> = {};
        columnPerms.forEach(p => {
          perms[p.column_name] = p.permission_level as PermissionLevel;
        });
        setColumnPermissions(perms);
      }
    } catch (error) {
      loggingService.error('Error loading permissions', { error }, 'PermissionEditor');
      toast.error('Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load existing permissions
  useEffect(() => {
    loadPermissions();
  }, [userId, loadPermissions]);

  const applyTemplate = (template: keyof typeof PERMISSION_TEMPLATES) => {
    const newPerms: Record<string, PermissionLevel> = {};
    EXCEL_COLUMNS.forEach(c => {
      newPerms[c.key] = 'none';
    });
    PERMISSION_TEMPLATES[template].forEach(p => {
      newPerms[p.column_name] = p.permission_level;
    });
    setColumnPermissions(newPerms);
    setUnsavedChanges(true);
  };

  const handleUpdatePermission = (columnKey: string, permissionLevel: 'none' | 'view' | 'edit') => {
    setColumnPermissions(prev => ({
      ...prev,
      [columnKey]: permissionLevel,
    }));
    setUnsavedChanges(true);
    form.setValue('column_key', columnKey);
    form.setValue('permission_level', permissionLevel);
  };

  const handleSave = async () => {
    const isValid = form.formState.isValid;
    if (!isValid) return;

    setSaving(true);
    try {
      // Save column permissions
      const permissions = Object.entries(columnPermissions)
        .filter(([_, level]) => level !== 'none')
        .map(([column, level]) => ({ column_name: column, permission_level: level }));

      const { error } = await setUserColumnPermissions(userId, permissions, 'vehicles', {
        actorId: currentUser?.id,
        companyId: currentUser?.companyId ?? currentUser?.company_id,
      });
      if (error) throw error;

      toast.success('Permissions updated successfully');
      setUnsavedChanges(false);
      onSave?.();
    } catch (error) {
      loggingService.error('Error saving permissions', { error }, 'PermissionEditor');
      toast.error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading permissions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {userName}
            </CardTitle>
            <CardDescription>
              Role: <Badge variant="outline">{userRole}</Badge>
            </CardDescription>
          </div>
          {unsavedChanges && (
            <div className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Unsaved changes</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="columns" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="columns">Column Permissions</TabsTrigger>
            <TabsTrigger value="general">General Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="columns" className="space-y-4">
            {/* Template Buttons */}
            <div className="flex flex-wrap gap-2 p-4 bg-secondary/50 rounded-lg">
              <span className="text-sm text-muted-foreground self-center">Quick templates:</span>
              <Button size="sm" variant="outline" onClick={() => applyTemplate('full')}>
                Full Access
              </Button>
              <Button size="sm" variant="outline" onClick={() => applyTemplate('readonly')}>
                Read Only
              </Button>
              <Button size="sm" variant="outline" onClick={() => applyTemplate('sales')}>
                Sales Role
              </Button>
              <Button size="sm" variant="outline" onClick={() => applyTemplate('accounts')}>
                Accounts Role
              </Button>
            </div>

            {/* Column Permission Grid */}
            <ScrollArea className="h-[400px] border rounded-md">
              <div className="p-4 space-y-2">
                {EXCEL_COLUMNS.map(column => {
                  const level = columnPermissions[column.key] || 'none';
                  return (
                    <div key={column.key} className="flex items-center gap-4 p-2 hover:bg-secondary/50 rounded">
                      <div className="flex-1 font-medium text-sm">{column.label}</div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={level === 'edit' ? 'default' : 'outline'}
                          onClick={() => handleUpdatePermission(column.key, 'edit')}
                          className="min-w-[70px]"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={level === 'view' ? 'default' : 'outline'}
                          onClick={() => handleUpdatePermission(column.key, 'view')}
                          className="min-w-[70px]"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant={level === 'none' ? 'default' : 'outline'}
                          onClick={() => handleUpdatePermission(column.key, 'none')}
                          className="min-w-[70px]"
                        >
                          <EyeOff className="h-3 w-3 mr-1" />
                          None
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="general" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label className="text-base">Can Edit Vehicles</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow user to make edits to vehicle records
                  </p>
                </div>
                <Switch
                  checked={canEdit}
                  onCheckedChange={setCanEdit}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label className="text-base">Can Bulk Edit</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow user to edit multiple vehicles at once
                  </p>
                </div>
                <Switch
                  checked={canBulkEdit}
                  onCheckedChange={setCanBulkEdit}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label className="text-base">Can View Details</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow user to see complete vehicle detail view
                  </p>
                </div>
                <Switch
                  checked={canViewDetails}
                  onCheckedChange={setCanViewDetails}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={!unsavedChanges || saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}