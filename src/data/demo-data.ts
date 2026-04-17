import { VehicleCanonical, ImportBatch, DataQualityIssue, Notification, AuditLog, Branch, Company, User, SlaPolicy, PlatformModule } from '@/types';
import { KPI_DEFINITIONS } from './kpi-definitions';
import { computeKpiSummaries } from '@/utils/kpi-computation';

export const demoVehicles: VehicleCanonical[] = [];

export const demoCompany: Company = { id: 'c1', name: 'FLC Auto Group', code: 'FLC' };

const branches = ['KK', 'TWU', 'SDK', 'LDU', 'BTU', 'MYY', 'SBW'];
export const demoBranches: Branch[] = branches.map((b, i) => ({ id: `br-${i}`, name: b, code: b, companyId: 'c1' }));

export const demoUser: User = {
  id: 'u1', email: 'director@flc.com', name: 'Sarah Chen', role: 'director', companyId: 'c1', accessScope: 'company',
};

export const demoImportBatches: ImportBatch[] = [];

export const demoQualityIssues: DataQualityIssue[] = [];

export const demoSLAs: SlaPolicy[] = KPI_DEFINITIONS.map(k => ({
  id: `sla-${k.id}`, kpiId: k.id, label: k.shortLabel, slaDays: k.slaDefault, companyId: 'c1',
}));

export const demoNotifications: Notification[] = [];

export const demoAuditLogs: AuditLog[] = [];

export const platformModules: PlatformModule[] = [
  { id: 'auto-aging', name: 'Auto Aging', description: 'Vehicle aging analysis across operational milestones', icon: 'Timer', status: 'active', path: '/auto-aging' },
  { id: 'sales', name: 'Sales Intelligence', description: 'Sales operations, transactions, and performance tracking', icon: 'TrendingUp', status: 'active', path: '/sales' },
  { id: 'inventory', name: 'Inventory Intelligence', description: 'Stock visibility, chassis movement, and transfer monitoring', icon: 'Package', status: 'active', path: '/inventory/stock' },
  { id: 'purchasing', name: 'Purchasing', description: 'Procurement invoice workflows and inbound purchasing activity', icon: 'Settings', status: 'active', path: '/purchasing/invoices' },
  { id: 'reports', name: 'Business Reports', description: 'Cross-module operational reporting, exports, and business summaries', icon: 'DollarSign', status: 'active', path: '/reports' },
  { id: 'admin', name: 'Administration', description: 'User access, configuration, master data, and governance tools', icon: 'UserCheck', status: 'active', path: '/admin/settings' },
  { id: 'hrms', name: 'HRMS', description: 'Employee directory, leave management, attendance, payroll, appraisals, and announcements', icon: 'Briefcase', status: 'active', path: '/hrms/employees' },
  { id: 'support', name: 'Customer Service', description: 'Support ticket submission and customer service workflows', icon: 'Users', status: 'active', path: '/portal/tickets/new' },
  { id: 'forecasting', name: 'Forecasting & AI Insights', description: 'Predictive analytics and AI recommendations', icon: 'Brain', status: 'planned' },
];
