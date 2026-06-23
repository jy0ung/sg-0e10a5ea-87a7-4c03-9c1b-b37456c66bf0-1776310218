import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Car, Package, TrendingUp, CreditCard, FileText, Truck, MapPin, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getVehicleByChassis } from '@/services/vehicleService';
import { getDealByVehicleId, getStageLabel, type Deal } from '@/services/dealService';
import type { VehicleCanonical } from '@/types';

interface LifecycleStage {
  id: string;
  label: string;
  icon: React.ElementType;
  status: 'completed' | 'active' | 'pending';
  date?: string;
  detail?: string;
  link?: string;
}

export default function VehicleLifecycle() {
  const { chassisNo } = useParams<{ chassisNo: string }>();
  const navigate = useNavigate();
  const { user: _user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vehicle, setVehicle] = useState<VehicleCanonical | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [stages, setStages] = useState<LifecycleStage[]>([]);

  const loadData = useCallback(async () => {
    if (!chassisNo) return;
    setLoading(true);
    try {
      // Load vehicle
      const { data: v, error: ve } = await getVehicleByChassis(chassisNo);
      if (ve) {
        toast.error('Vehicle not found');
        navigate('/auto-aging');
        return;
      }
      setVehicle(v);

      // Load deal linked to this vehicle
      if (v?.id) {
        const { data: d } = await getDealByVehicleId(v.id);
        setDeal(d);
      }

      // Build lifecycle stages
      const lifecycleStages: LifecycleStage[] = [];

      // Stage 1: Procurement (always present if vehicle exists)
      lifecycleStages.push({
        id: 'procurement',
        label: 'Procurement',
        icon: Package,
        status: 'completed',
        date: v?.created_at,
        detail: v?.branch_code ? `Branch: ${v.branch_code}` : undefined,
      });

      // Stage 2: Receiving
      lifecycleStages.push({
        id: 'receiving',
        label: 'Receiving',
        icon: Truck,
        status: v?.chassis_no ? 'completed' : 'pending',
        detail: v?.chassis_no ? `Chassis: ${v.chassis_no}` : undefined,
      });

      // Stage 3: Stock
      const stockDays = v?.created_at
        ? Math.floor((Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      lifecycleStages.push({
        id: 'stock',
        label: 'Stock',
        icon: Car,
        status: !d ? 'active' : 'completed',
        detail: `${stockDays} days in stock`,
      });

      // Stage 4: Sale
      lifecycleStages.push({
        id: 'sale',
        label: 'Sale',
        icon: TrendingUp,
        status: d ? (d.stage === 'lead' || d.stage === 'prospect' ? 'active' : 'completed') : 'pending',
        date: d?.created_at,
        detail: d ? `${d.customer_name} — ${getStageLabel(d.stage)}` : undefined,
        link: d ? `/sales/deals/${d.id}` : undefined,
      });

      // Stage 5: Finance
      lifecycleStages.push({
        id: 'finance',
        label: 'Finance',
        icon: CreditCard,
        status: d?.deal_loan
          ? (d.deal_loan.status === 'disbursed' ? 'completed' : 'active')
          : (d && ['loan_submission', 'lou'].includes(d.stage) ? 'active' : 'pending'),
        detail: d?.deal_loan ? `${d.deal_loan.bank_name || '—'} — ${d.deal_loan.status}` : undefined,
        link: d ? `/sales/deals/${d.id}` : undefined,
      });

      // Stage 6: Registration
      lifecycleStages.push({
        id: 'registration',
        label: 'Registration',
        icon: FileText,
        status: d?.deal_registration
          ? (d.deal_registration.status === 'registered' || d.deal_registration.status === 'plate_received' ? 'completed' : 'active')
          : 'pending',
        detail: d?.deal_registration?.plate_no ? `Plate: ${d.deal_registration.plate_no}` : undefined,
        link: d ? `/sales/deals/${d.id}` : undefined,
      });

      // Stage 7: Delivery
      lifecycleStages.push({
        id: 'delivery',
        label: 'Delivery',
        icon: MapPin,
        status: d?.stage === 'completed' ? 'completed' : (d?.stage === 'delivery' ? 'active' : 'pending'),
        date: d?.completed_at,
        link: d ? `/sales/deals/${d.id}` : undefined,
      });

      setStages(lifecycleStages);
    } catch {
      toast.error('Failed to load vehicle data');
    } finally {
      setLoading(false);
    }
  }, [chassisNo, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Vehicle not found</p>
        <Button variant="link" onClick={() => navigate('/auto-aging')}>Back to Auto Aging</Button>
      </div>
    );
  }

  const stockDays = vehicle.created_at
    ? Math.floor((Date.now() - new Date(vehicle.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/auto-aging')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={`Vehicle: ${vehicle.chassis_no || '—'}`}
          subtitle={`${vehicle.model || '—'} · ${vehicle.branch_code || '—'} · ${stockDays} days in stock`}
        />
      </div>

      {/* Vehicle Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Model</p>
            <p className="font-medium">{vehicle.model || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Branch</p>
            <p className="font-medium">{vehicle.branch_code || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Chassis</p>
            <p className="font-medium font-mono text-xs">{vehicle.chassis_no || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Owner</p>
            <p className="font-medium">{vehicle.owner_name || vehicle.customer_name || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lifecycle Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lifecycle Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

            <div className="space-y-6">
              {stages.map((stage, index) => {
                const Icon = stage.icon;
                const StatusIcon = stage.status === 'completed' ? CheckCircle
                  : stage.status === 'active' ? Clock
                  : AlertTriangle;

                return (
                  <div key={stage.id} className="relative flex items-start gap-4">
                    {/* Timeline dot */}
                    <div className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 ${
                      stage.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500'
                      : stage.status === 'active' ? 'bg-amber-500/10 border-amber-500'
                      : 'bg-muted border-border'
                    }`}>
                      <Icon className={`h-5 w-5 ${
                        stage.status === 'completed' ? 'text-emerald-600'
                        : stage.status === 'active' ? 'text-amber-600'
                        : 'text-muted-foreground'
                      }`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 pt-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{stage.label}</h3>
                        <Badge variant={
                          stage.status === 'completed' ? 'default'
                          : stage.status === 'active' ? 'secondary'
                          : 'outline'
                        } className="text-[10px]">
                          {stage.status === 'completed' ? 'Done'
                            : stage.status === 'active' ? 'In Progress'
                            : 'Pending'}
                        </Badge>
                        <StatusIcon className={`h-3.5 w-3.5 ${
                          stage.status === 'completed' ? 'text-emerald-500'
                          : stage.status === 'active' ? 'text-amber-500'
                          : 'text-muted-foreground'
                        }`} />
                      </div>
                      {stage.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5">{stage.detail}</p>
                      )}
                      {stage.date && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(stage.date).toLocaleDateString()}
                        </p>
                      )}
                      {stage.link && stage.status !== 'pending' && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 mt-1 text-xs"
                          onClick={() => navigate(stage.link!)}
                        >
                          View deal →
                        </Button>
                      )}
                    </div>

                    {/* Step number */}
                    <div className="flex-shrink-0 text-xs text-muted-foreground font-mono">
                      {index + 1}/{stages.length}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deal Details (if linked) */}
      {deal && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Deal No</span>
                <span className="font-medium">{deal.deal_no}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{deal.customer_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Stage</span>
                <Badge variant="outline">{getStageLabel(deal.stage)}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">RM {(deal.total_amount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Advisor</span>
                <span className="font-medium">{deal.sales_advisor_name || '—'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" variant="outline" onClick={() => navigate(`/sales/deals/${deal.id}`)}>
                Open Deal
              </Button>
              {!deal.vehicle_id && (
                <Button className="w-full" variant="outline" onClick={() => {
                  toast.info('Link vehicle to deal — coming soon');
                }}>
                  Link Vehicle to Deal
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* No deal linked */}
      {!deal && (
        <Card>
          <CardContent className="p-6 text-center">
            <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-2">No deal linked to this vehicle</p>
            <Button onClick={() => navigate(`/sales/deals/new?chassis=${encodeURIComponent(vehicle.chassis_no || '')}&model=${encodeURIComponent(vehicle.model || '')}&colour=${encodeURIComponent(vehicle.colour || '')}`)}>
              Create Deal for this Vehicle
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
