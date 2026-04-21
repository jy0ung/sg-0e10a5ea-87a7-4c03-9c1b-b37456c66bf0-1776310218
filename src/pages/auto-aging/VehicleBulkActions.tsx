import React, { useEffect } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { logVehicleEdit } from '@/services/auditService';
import { bulkUpdateVehicles, softDeleteVehicles } from '@/services/vehicleService';
import type { VehicleCanonical } from '@/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VehicleBulkActionsProps {
  selectedVehicles: VehicleCanonical[];
  action: string;
  onComplete: () => void;
}

export function VehicleBulkActions({ selectedVehicles, action, onComplete }: VehicleBulkActionsProps) {
  const { user } = useAuth();
  const { reloadFromDb, vehicles } = useData();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const [targetBranch, setTargetBranch] = React.useState('');

  const branches = [...new Set(vehicles.map(v => v.branch_code))].sort();

  useEffect(() => { setOpen(true); }, []);

  const handleClose = () => {
    setOpen(false);
    onComplete();
  };

  const handleDelete = async () => {
    if (!user?.id || selectedVehicles.length === 0) return;
    setLoading(true);
    try {
      const ids = selectedVehicles.map(v => v.id);
      const { error } = await softDeleteVehicles(ids);
      if (error) throw error;
      await Promise.all(
        selectedVehicles.map(v => logVehicleEdit(user.id, v.id, { is_deleted: { before: false, after: true } }))
      );
      await reloadFromDb();
      toast({ title: `${selectedVehicles.length} vehicle(s) deleted` });
    } catch (err) {
      toast({ title: 'Delete failed', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  const handleMarkComplete = async () => {
    if (!user?.id || selectedVehicles.length === 0) return;
    setLoading(true);
    try {
      const ids = selectedVehicles.map(v => v.id);
      const { error } = await bulkUpdateVehicles(ids, { remark: 'Completed' });
      if (error) throw error;
      await Promise.all(
        selectedVehicles.map(v =>
          logVehicleEdit(user.id, v.id, { remark: { before: v.remark, after: 'Completed' } })
        )
      );
      await reloadFromDb();
      toast({ title: `${selectedVehicles.length} vehicle(s) marked complete` });
    } catch (err) {
      toast({ title: 'Action failed', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  const handleAssign = async () => {
    if (!user?.id || !targetBranch || selectedVehicles.length === 0) return;
    setLoading(true);
    try {
      const ids = selectedVehicles.map(v => v.id);
      const { error } = await bulkUpdateVehicles(ids, { branch_code: targetBranch });
      if (error) throw error;
      await Promise.all(
        selectedVehicles.map(v =>
          logVehicleEdit(user.id, v.id, { branch_code: { before: v.branch_code, after: targetBranch } })
        )
      );
      await reloadFromDb();
      toast({ title: `${selectedVehicles.length} vehicle(s) reassigned to ${targetBranch}` });
    } catch (err) {
      toast({ title: 'Assign failed', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  if (action === 'assign') {
    return (
      <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Branch — {selectedVehicles.length} vehicle(s)</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Select the target branch to reassign all selected vehicles to.</p>
            <Select value={targetBranch} onValueChange={setTargetBranch}>
              <SelectTrigger><SelectValue placeholder="Select branch…" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
            <Button onClick={handleAssign} disabled={loading || !targetBranch}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const isDelete = action === 'delete';

  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDelete ? `Delete ${selectedVehicles.length} vehicle(s)?` : `Mark ${selectedVehicles.length} vehicle(s) complete?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDelete
              ? 'These vehicles will be soft-deleted and hidden from all views. An admin can restore them via the database.'
              : 'The remark on all selected vehicles will be set to "Completed".'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose} disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={isDelete ? handleDelete : handleMarkComplete}
            disabled={loading}
            className={isDelete ? 'bg-destructive hover:bg-destructive/90' : undefined}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isDelete ? 'Delete' : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}