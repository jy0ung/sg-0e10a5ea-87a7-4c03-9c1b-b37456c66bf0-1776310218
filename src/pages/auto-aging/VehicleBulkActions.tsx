import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { updateVehicleWithAudit } from '@/services/vehicleService';
import type { VehicleCanonical } from '@/types';
import { Loader2, Trash2, CheckCircle } from 'lucide-react';

interface VehicleBulkActionsProps {
  selectedVehicles: VehicleCanonical[];
  action: string;
  onComplete: () => void;
}

export function VehicleBulkActions({ selectedVehicles, action, onComplete }: VehicleBulkActionsProps) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);

  const handleBulkUpdate = async () => {
    if (!user?.id || selectedVehicles.length === 0) return;

    setLoading(true);

    try {
      switch (action) {
        case 'delete':
          console.log('Bulk delete not implemented');
          break;
        case 'mark_complete':
          for (const vehicle of selectedVehicles) {
            await updateVehicleWithAudit(vehicle.id, { status: 'completed' }, user.id);
          }
          break;
        case 'assign':
          console.log('Bulk assign not implemented');
          break;
        default:
          console.log('Unknown action:', action);
      }
    } catch (error) {
      console.error('Bulk action failed:', error);
    } finally {
      setLoading(false);
      onComplete();
    }
  };

  const getActionTitle = () => {
    switch (action) {
      case 'delete':
        return 'Delete Selected Vehicles';
      case 'mark_complete':
        return 'Mark as Complete';
      case 'assign':
        return 'Assign Vehicles';
      default:
        return 'Perform Action';
    }
  };

  const getActionDescription = () => {
    switch (action) {
      case 'delete':
        return `Are you sure you want to delete ${selectedVehicles.length} vehicle(s)? This action cannot be undone.`;
      case 'mark_complete':
        return `Are you sure you want to mark ${selectedVehicles.length} vehicle(s) as complete?`;
      case 'assign':
        return `Assign ${selectedVehicles.length} vehicle(s) to a user.`;
      default:
        return 'Are you sure you want to perform this action?';
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Confirm
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{getActionTitle()}</AlertDialogTitle>
          <AlertDialogDescription>{getActionDescription()}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleBulkUpdate} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}