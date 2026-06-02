import type { AppRole, PlatformModuleId } from '@flc/types';

export type PlatformShell = 'main' | 'portal' | 'hrms';

export type PlatformSectionName =
  | 'Platform'
  | 'Auto Aging'
  | 'Sales'
  | 'Inventory'
  | 'Purchasing'
  | 'Accounts'
  | 'Reports'
  | 'HRMS'
  | 'Admin'
  | 'Internal Requests';

export type PlatformIconKey =
  | 'alert-triangle'
  | 'arrow-left-right'
  | 'bar-chart'
  | 'bell'
  | 'book-open'
  | 'briefcase'
  | 'calendar'
  | 'car'
  | 'check-square'
  | 'database'
  | 'dollar-sign'
  | 'file-spreadsheet'
  | 'file-text'
  | 'gauge'
  | 'git-branch'
  | 'headphones'
  | 'history'
  | 'inbox'
  | 'kanban'
  | 'landmark'
  | 'layout-dashboard'
  | 'map'
  | 'package'
  | 'receipt'
  | 'scale'
  | 'search'
  | 'settings'
  | 'shield'
  | 'shopping-cart'
  | 'sparkles'
  | 'target'
  | 'timer'
  | 'trending-down'
  | 'trending-up'
  | 'truck'
  | 'upload'
  | 'user-check'
  | 'users';

export interface PlatformSectionDefinition {
  name: PlatformSectionName;
  icon: PlatformIconKey;
  path?: string;
  moduleGate?: PlatformModuleId;
  external?: boolean;
}

export interface PlatformRouteChromeDefinition {
  pattern: RegExp;
  title: string;
  kicker?: string;
}

export type PlatformUnavailableReason = 'disabledModule' | 'missingPermission' | 'planned';

export interface PlatformUnavailableCopy {
  title: string;
  description: string;
}

export interface PlatformRouteDefinition {
  id: string;
  label: string;
  path: string;
  shell: PlatformShell;
  section: PlatformSectionName;
  icon: PlatformIconKey;
  group?: string;
  end?: boolean;
  external?: boolean;
  moduleGate?: PlatformModuleId;
  roles?: readonly AppRole[];
  navShell?: PlatformShell;
  featureFlag?: string;
  smoke?: {
    app: PlatformShell;
    name?: string;
    path?: string;
  };
  unavailable?: Partial<Record<PlatformUnavailableReason, string>>;
}

export interface ProductionSmokeRoute {
  module: string;
  name: string;
  path: string;
}

export const PLATFORM_SECTIONS: readonly PlatformSectionDefinition[] = [
  { name: 'Platform', icon: 'layout-dashboard' },
  { name: 'Auto Aging', icon: 'timer', path: '/auto-aging', moduleGate: 'auto-aging' },
  { name: 'Sales', icon: 'trending-up', path: '/sales', moduleGate: 'sales' },
  { name: 'Inventory', icon: 'package', path: '/inventory/stock', moduleGate: 'inventory' },
  { name: 'Purchasing', icon: 'truck', path: '/purchasing/invoices', moduleGate: 'purchasing' },
  { name: 'Accounts', icon: 'landmark', path: '/accounts/chart' },
  { name: 'Reports', icon: 'bar-chart', path: '/reports', moduleGate: 'reports' },
  { name: 'HRMS', icon: 'briefcase', path: '/hrms/', moduleGate: 'hrms', external: true },
  { name: 'Admin', icon: 'shield', path: '/admin/settings', moduleGate: 'admin' },
  { name: 'Internal Requests', icon: 'headphones', path: '/portal', moduleGate: 'support' },
] as const;

export const PLATFORM_ROUTES: readonly PlatformRouteDefinition[] = [
  { id: 'platform-root', label: 'Dashboard', path: '/', shell: 'main', section: 'Platform', icon: 'layout-dashboard', smoke: { app: 'main' } },
  { id: 'platform-modules-legacy', label: 'Home legacy redirect', path: '/modules', shell: 'main', section: 'Platform', icon: 'layout-dashboard', smoke: { app: 'main', name: 'Home legacy redirect' } },
  { id: 'platform-home', label: 'Home', path: '/home', shell: 'main', section: 'Platform', icon: 'layout-dashboard', end: true, navShell: 'main', smoke: { app: 'main' } },
  { id: 'platform-inbox', label: 'Inbox', path: '/inbox', shell: 'main', section: 'Platform', icon: 'inbox', navShell: 'main', featureFlag: 'phase4.unified-inbox', smoke: { app: 'main' } },
  { id: 'platform-notifications', label: 'Notifications', path: '/notifications', shell: 'main', section: 'Platform', icon: 'bell', navShell: 'main', smoke: { app: 'main' } },
  { id: 'platform-internal-requests-shortcut', label: 'Internal Requests', path: '/portal/tickets/new', shell: 'portal', section: 'Platform', icon: 'headphones', moduleGate: 'support', navShell: 'main' },

  { id: 'portal-new-request', label: 'New Ticket', path: '/portal/tickets/new', shell: 'portal', section: 'Internal Requests', icon: 'headphones', moduleGate: 'support', smoke: { app: 'main' } },
  { id: 'portal-my-requests', label: 'My Tickets', path: '/portal/tickets', shell: 'portal', section: 'Internal Requests', icon: 'file-text', moduleGate: 'support', smoke: { app: 'main' } },
  { id: 'portal-queue', label: 'Request Queue', path: '/portal/queue', shell: 'portal', section: 'Internal Requests', icon: 'inbox', moduleGate: 'support', roles: ['super_admin', 'company_admin', 'portal_admin', 'portal_manager'], smoke: { app: 'main' } },
  { id: 'portal-setup', label: 'Request Setup', path: '/portal/setup', shell: 'portal', section: 'Internal Requests', icon: 'settings', moduleGate: 'support', roles: ['super_admin', 'company_admin', 'portal_admin'], smoke: { app: 'main' } },

  { id: 'auto-aging-overview', label: 'Auto Aging Overview', path: '/auto-aging', shell: 'main', section: 'Auto Aging', icon: 'timer', group: 'Overview', end: true, moduleGate: 'auto-aging', navShell: 'main', smoke: { app: 'main', name: 'Overview' } },
  { id: 'auto-aging-vehicles', label: 'Vehicle Explorer', path: '/auto-aging/vehicles', shell: 'main', section: 'Auto Aging', icon: 'car', group: 'Overview', moduleGate: 'auto-aging', navShell: 'main', smoke: { app: 'main' } },
  { id: 'auto-aging-import', label: 'Import Center', path: '/auto-aging/import', shell: 'main', section: 'Auto Aging', icon: 'upload', group: 'Data Import', moduleGate: 'auto-aging', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'auto-aging-review', label: 'Review Queue', path: '/auto-aging/review', shell: 'main', section: 'Auto Aging', icon: 'search', group: 'Data Import', moduleGate: 'auto-aging', featureFlag: 'phase3a.import-review-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'auto-aging-review-detail', label: 'Review Batch', path: '/auto-aging/review/:batchId', shell: 'main', section: 'Auto Aging', icon: 'search', group: 'Data Import', moduleGate: 'auto-aging', featureFlag: 'phase3a.import-review-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { id: 'auto-aging-history', label: 'Import History', path: '/auto-aging/history', shell: 'main', section: 'Auto Aging', icon: 'history', group: 'Data Import', moduleGate: 'auto-aging', navShell: 'main', smoke: { app: 'main' } },
  { id: 'auto-aging-quality', label: 'Data Quality', path: '/auto-aging/quality', shell: 'main', section: 'Auto Aging', icon: 'alert-triangle', group: 'Configuration', moduleGate: 'auto-aging', navShell: 'main', smoke: { app: 'main' } },
  { id: 'auto-aging-sla', label: 'SLA Policies', path: '/auto-aging/sla', shell: 'main', section: 'Auto Aging', icon: 'gauge', group: 'Configuration', moduleGate: 'auto-aging', roles: ['super_admin', 'company_admin', 'director', 'general_manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'auto-aging-mappings', label: 'Mappings', path: '/auto-aging/mappings', shell: 'main', section: 'Auto Aging', icon: 'map', group: 'Configuration', moduleGate: 'auto-aging', roles: ['super_admin', 'company_admin', 'director', 'general_manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'auto-aging-commissions', label: 'Commissions', path: '/auto-aging/commissions', shell: 'main', section: 'Auto Aging', icon: 'dollar-sign', group: 'Insights', moduleGate: 'auto-aging', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'auto-aging-reports', label: 'Aging Reports', path: '/auto-aging/reports', shell: 'main', section: 'Auto Aging', icon: 'file-spreadsheet', group: 'Insights', moduleGate: 'auto-aging', navShell: 'main', smoke: { app: 'main' } },

  { id: 'sales-overview', label: 'Sales Overview', path: '/sales', shell: 'main', section: 'Sales', icon: 'trending-up', group: 'Overview', end: true, moduleGate: 'sales', navShell: 'main', smoke: { app: 'main', name: 'Overview' } },
  { id: 'sales-pipeline', label: 'Deal Pipeline', path: '/sales/pipeline', shell: 'main', section: 'Sales', icon: 'kanban', group: 'Overview', moduleGate: 'sales', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'sales-lead-intake', label: 'Lead Intake', path: '/sales/lead-intake', shell: 'main', section: 'Sales', icon: 'target', group: 'Overview', moduleGate: 'sales', featureFlag: 'phase3f.lead-intake-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'sales-lead-detail', label: 'Lead Detail', path: '/sales/lead-intake/:kind/:rawId', shell: 'main', section: 'Sales', icon: 'target', group: 'Overview', moduleGate: 'sales', featureFlag: 'phase3f.lead-intake-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { id: 'sales-performance', label: 'Performance', path: '/sales/performance', shell: 'main', section: 'Sales', icon: 'target', group: 'Analytics', moduleGate: 'sales', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'sales-margin', label: 'Margin Analysis', path: '/sales/margin', shell: 'main', section: 'Sales', icon: 'trending-down', group: 'Analytics', moduleGate: 'sales', roles: ['super_admin', 'company_admin', 'director', 'general_manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'sales-orders', label: 'Sales Orders', path: '/sales/orders', shell: 'main', section: 'Sales', icon: 'shopping-cart', group: 'Transactions', moduleGate: 'sales', navShell: 'main', smoke: { app: 'main' } },
  { id: 'sales-invoices', label: 'Invoices', path: '/sales/invoices', shell: 'main', section: 'Sales', icon: 'receipt', group: 'Transactions', moduleGate: 'sales', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'sales-customers', label: 'Customers', path: '/sales/customers', shell: 'main', section: 'Sales', icon: 'users', group: 'Transactions', moduleGate: 'sales', smoke: { app: 'main' } },
  { id: 'sales-dealer-invoices', label: 'Dealer Invoices', path: '/sales/dealer-invoices', shell: 'main', section: 'Sales', icon: 'file-text', group: 'Operations', moduleGate: 'sales', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'sales-verify-or', label: 'Official Receipts', path: '/sales/verify-or', shell: 'main', section: 'Sales', icon: 'receipt', group: 'Operations', moduleGate: 'sales', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main', name: 'Verify OR' } },
  { id: 'sales-outstanding', label: 'Outstanding Collection', path: '/sales/outstanding', shell: 'main', section: 'Sales', icon: 'receipt', group: 'Operations', moduleGate: 'sales', smoke: { app: 'main' } },
  { id: 'sales-advisors', label: 'Sales Advisors', path: '/sales/advisors', shell: 'main', section: 'Sales', icon: 'user-check', group: 'Team', moduleGate: 'sales', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },

  { id: 'inventory-stock', label: 'Stock Balance', path: '/inventory/stock', shell: 'main', section: 'Inventory', icon: 'package', group: 'Overview', moduleGate: 'inventory', navShell: 'main', smoke: { app: 'main' } },
  { id: 'inventory-chassis-filter', label: 'Advanced Search', path: '/inventory/chassis-filter', shell: 'main', section: 'Inventory', icon: 'kanban', group: 'Overview', moduleGate: 'inventory', navShell: 'main', smoke: { app: 'main', name: 'Chassis Filter' } },
  { id: 'inventory-transfers', label: 'Vehicle Transfer', path: '/inventory/transfers', shell: 'main', section: 'Inventory', icon: 'arrow-left-right', group: 'Movement', moduleGate: 'inventory', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'inventory-chassis', label: 'Chassis Movement', path: '/inventory/chassis', shell: 'main', section: 'Inventory', icon: 'kanban', group: 'Movement', moduleGate: 'inventory', smoke: { app: 'main' } },

  { id: 'purchasing-orders', label: 'Purchase Orders', path: '/purchasing/orders', shell: 'main', section: 'Purchasing', icon: 'shopping-cart', group: 'Operations', moduleGate: 'purchasing', featureFlag: 'phase3e.po-grn-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'purchasing-order-new', label: 'New Purchase Order', path: '/purchasing/orders/new', shell: 'main', section: 'Purchasing', icon: 'shopping-cart', group: 'Operations', moduleGate: 'purchasing', featureFlag: 'phase3e.po-grn-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { id: 'purchasing-order-detail', label: 'Purchase Order', path: '/purchasing/orders/:id', shell: 'main', section: 'Purchasing', icon: 'shopping-cart', group: 'Operations', moduleGate: 'purchasing', featureFlag: 'phase3e.po-grn-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { id: 'purchasing-grn', label: 'Goods Receipt Notes', path: '/purchasing/grn', shell: 'main', section: 'Purchasing', icon: 'package', group: 'Operations', moduleGate: 'purchasing', featureFlag: 'phase3e.po-grn-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'purchasing-grn-new', label: 'Receive Goods', path: '/purchasing/grn/new', shell: 'main', section: 'Purchasing', icon: 'package', group: 'Operations', moduleGate: 'purchasing', featureFlag: 'phase3e.po-grn-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { id: 'purchasing-grn-detail', label: 'Goods Receipt Note', path: '/purchasing/grn/:id', shell: 'main', section: 'Purchasing', icon: 'package', group: 'Operations', moduleGate: 'purchasing', featureFlag: 'phase3e.po-grn-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'] },
  { id: 'purchasing-three-way-match', label: '3-way Match', path: '/purchasing/three-way-match', shell: 'main', section: 'Purchasing', icon: 'arrow-left-right', group: 'Operations', moduleGate: 'purchasing', featureFlag: 'phase3e.po-grn-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'purchasing-invoices', label: 'Purchase Invoices', path: '/purchasing/invoices', shell: 'main', section: 'Purchasing', icon: 'truck', group: 'Operations', moduleGate: 'purchasing', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'manager'], navShell: 'main', smoke: { app: 'main' } },

  { id: 'accounts-chart', label: 'Chart of Accounts', path: '/accounts/chart', shell: 'main', section: 'Accounts', icon: 'book-open', group: 'Ledger', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main' },
  { id: 'accounts-periods', label: 'Accounting Periods', path: '/accounts/periods', shell: 'main', section: 'Accounts', icon: 'calendar', group: 'Ledger', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main' },
  { id: 'accounts-trial-balance', label: 'Trial Balance', path: '/accounts/trial-balance', shell: 'main', section: 'Accounts', icon: 'scale', group: 'Reports', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main' },
  { id: 'accounts-profit-loss', label: 'Profit & Loss', path: '/accounts/profit-loss', shell: 'main', section: 'Accounts', icon: 'trending-up', group: 'Reports', featureFlag: 'phase3b.financial-reports-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'accounts-balance-sheet', label: 'Balance Sheet', path: '/accounts/balance-sheet', shell: 'main', section: 'Accounts', icon: 'landmark', group: 'Reports', featureFlag: 'phase3b.financial-reports-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'accounts-aging-by-branch', label: 'Aging by Branch', path: '/accounts/aging-by-branch', shell: 'main', section: 'Accounts', icon: 'git-branch', group: 'Reports', featureFlag: 'phase3b.financial-reports-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'accounts-cash-position', label: 'Cash Position', path: '/accounts/cash-position', shell: 'main', section: 'Accounts', icon: 'dollar-sign', group: 'Reports', featureFlag: 'phase3b.financial-reports-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'accounts-period-close', label: 'Period Close', path: '/accounts/period-close', shell: 'main', section: 'Accounts', icon: 'check-square', group: 'Reports', featureFlag: 'phase3b.financial-reports-v2', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'accounts-journal', label: 'Journal Entries', path: '/accounts/journal', shell: 'main', section: 'Accounts', icon: 'file-text', group: 'Reports', roles: ['super_admin', 'company_admin', 'director', 'general_manager', 'accounts'], navShell: 'main' },

  { id: 'reports-business', label: 'Business Reports', path: '/reports', shell: 'main', section: 'Reports', icon: 'bar-chart', group: 'Workspace', end: true, moduleGate: 'reports', navShell: 'main', smoke: { app: 'main' } },
  { id: 'hrms-open-workspace', label: 'Open HRMS Workspace', path: '/hrms/', shell: 'hrms', section: 'HRMS', icon: 'briefcase', group: 'Workspace', external: true, moduleGate: 'hrms', navShell: 'main' },

  { id: 'admin-settings', label: 'Settings', path: '/admin/settings', shell: 'main', section: 'Admin', icon: 'settings', group: 'Configuration', moduleGate: 'admin', navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-activity', label: 'Activity Overview', path: '/admin/activity', shell: 'main', section: 'Admin', icon: 'bar-chart', group: 'Governance', moduleGate: 'admin', roles: ['super_admin', 'company_admin', 'director', 'general_manager'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-kpi-studio', label: 'KPI Studio', path: '/admin/kpi-studio', shell: 'main', section: 'Admin', icon: 'sparkles', group: 'Governance', moduleGate: 'admin', featureFlag: 'phase4.role-home', roles: ['super_admin', 'company_admin', 'director'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-dms-sync', label: 'DMS Sync Ops', path: '/admin/dms-sync', shell: 'main', section: 'Admin', icon: 'database', group: 'Governance', moduleGate: 'admin', featureFlag: 'phase3c.dms-sync-ops-v2', roles: ['super_admin', 'company_admin', 'director'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-reconciliation', label: 'Reconciliation Queue', path: '/admin/reconciliation', shell: 'main', section: 'Admin', icon: 'arrow-left-right', group: 'Governance', moduleGate: 'admin', featureFlag: 'phase3d.reconciliation-review-v2', roles: ['super_admin', 'company_admin', 'director'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-reconciliation-detail', label: 'Reconciliation Match', path: '/admin/reconciliation/:matchId', shell: 'main', section: 'Admin', icon: 'arrow-left-right', group: 'Governance', moduleGate: 'admin', featureFlag: 'phase3d.reconciliation-review-v2', roles: ['super_admin', 'company_admin', 'director'] },
  { id: 'admin-audit', label: 'Audit Log', path: '/admin/audit', shell: 'main', section: 'Admin', icon: 'file-text', group: 'Governance', moduleGate: 'admin', roles: ['super_admin', 'company_admin', 'director'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-webhooks', label: 'Webhook Outbox', path: '/admin/webhooks', shell: 'main', section: 'Admin', icon: 'git-branch', group: 'Governance', moduleGate: 'admin', featureFlag: 'phase6.webhook-outbox', roles: ['super_admin', 'company_admin'] },
  { id: 'admin-users', label: 'Users & Roles', path: '/admin/users', shell: 'main', section: 'Admin', icon: 'shield', group: 'Access', moduleGate: 'admin', roles: ['super_admin', 'company_admin'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-user-groups', label: 'User Groups', path: '/admin/user-groups', shell: 'main', section: 'Admin', icon: 'shield', group: 'Access', moduleGate: 'admin', roles: ['super_admin', 'company_admin'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-role-permissions', label: 'Role Permissions', path: '/admin/role-permissions', shell: 'main', section: 'Admin', icon: 'shield', group: 'Access', moduleGate: 'admin', roles: ['super_admin', 'company_admin'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-branches', label: 'Branch Management', path: '/admin/branches', shell: 'main', section: 'Admin', icon: 'git-branch', group: 'Master Data', moduleGate: 'admin', roles: ['super_admin', 'company_admin'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-master-data', label: 'Master Data', path: '/admin/master-data', shell: 'main', section: 'Admin', icon: 'database', group: 'Master Data', moduleGate: 'admin', roles: ['super_admin', 'company_admin'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-suppliers', label: 'Suppliers', path: '/admin/suppliers', shell: 'main', section: 'Admin', icon: 'truck', group: 'Master Data', moduleGate: 'admin', roles: ['super_admin', 'company_admin'], navShell: 'main', smoke: { app: 'main' } },
  { id: 'admin-dealers', label: 'Dealers', path: '/admin/dealers', shell: 'main', section: 'Admin', icon: 'users', group: 'Master Data', moduleGate: 'admin', roles: ['super_admin', 'company_admin'], navShell: 'main', smoke: { app: 'main' } },

  { id: 'hrms-root', label: 'Root Redirect', path: '/', shell: 'hrms', section: 'HRMS', icon: 'briefcase', smoke: { app: 'hrms' } },
  { id: 'hrms-leave', label: 'Leave', path: '/leave', shell: 'hrms', section: 'HRMS', icon: 'calendar', smoke: { app: 'hrms' } },
  { id: 'hrms-approvals', label: 'Approvals', path: '/approvals', shell: 'hrms', section: 'HRMS', icon: 'check-square', smoke: { app: 'hrms' } },
  { id: 'hrms-appraisals', label: 'Appraisals', path: '/appraisals', shell: 'hrms', section: 'HRMS', icon: 'sparkles', smoke: { app: 'hrms' } },
  { id: 'hrms-announcements', label: 'Announcements', path: '/announcements', shell: 'hrms', section: 'HRMS', icon: 'bell', smoke: { app: 'hrms' } },
  { id: 'hrms-profile', label: 'Profile', path: '/profile', shell: 'hrms', section: 'HRMS', icon: 'users', smoke: { app: 'hrms' } },
  { id: 'hrms-attendance', label: 'Attendance', path: '/attendance', shell: 'hrms', section: 'HRMS', icon: 'timer', smoke: { app: 'hrms' } },
  { id: 'hrms-leave-calendar', label: 'Leave Calendar', path: '/leave/calendar', shell: 'hrms', section: 'HRMS', icon: 'calendar', smoke: { app: 'hrms' } },
  { id: 'hrms-employees', label: 'Employees', path: '/employees', shell: 'hrms', section: 'HRMS', icon: 'users', smoke: { app: 'hrms' } },
  { id: 'hrms-payroll', label: 'Payroll', path: '/payroll', shell: 'hrms', section: 'HRMS', icon: 'dollar-sign', smoke: { app: 'hrms' } },
  { id: 'hrms-settings', label: 'Settings', path: '/settings', shell: 'hrms', section: 'HRMS', icon: 'settings', smoke: { app: 'hrms' } },
  { id: 'hrms-approval-flows-legacy', label: 'Approval Flows', path: '/approval-flows', shell: 'hrms', section: 'HRMS', icon: 'settings', smoke: { app: 'hrms' } },
] as const;

export const MAIN_NAV_ROUTES = PLATFORM_ROUTES.filter((route) => route.navShell === 'main');

export const MAIN_ROUTE_CHROME: readonly PlatformRouteChromeDefinition[] = [
  { pattern: /^\/(home)?$/, title: 'Home', kicker: 'Role-aware workspace' },
  { pattern: /^\/inbox/, title: 'Inbox', kicker: 'Approvals · Reconciliation · Requests · Alerts' },
  { pattern: /^\/admin\/kpi-studio/, title: 'KPI Studio', kicker: 'Curate KPIs per role' },
  { pattern: /^\/notifications/, title: 'Notifications', kicker: 'Operational alerts' },
  { pattern: /^\/auto-aging\/vehicles/, title: 'Vehicle Explorer', kicker: 'Aging drilldown' },
  { pattern: /^\/auto-aging\/reports/, title: 'Auto Aging Reports', kicker: 'Report builder' },
  { pattern: /^\/auto-aging/, title: 'Auto Aging', kicker: 'Inventory aging operations' },
  { pattern: /^\/sales\/pipeline/, title: 'Deal Pipeline', kicker: 'Sales execution' },
  { pattern: /^\/sales\/orders/, title: 'Sales Orders', kicker: 'Order management' },
  { pattern: /^\/sales\/customers/, title: 'Customers', kicker: 'Customer records' },
  { pattern: /^\/sales/, title: 'Sales', kicker: 'Revenue workspace' },
  { pattern: /^\/inventory/, title: 'Inventory', kicker: 'Stock and movement' },
  { pattern: /^\/purchasing/, title: 'Purchasing', kicker: 'Vendor operations' },
  { pattern: /^\/accounts/, title: 'Accounts', kicker: 'Financial reporting' },
  { pattern: /^\/reports/, title: 'Business Reports', kicker: 'Cross-module reporting' },
  { pattern: /^\/admin/, title: 'Administration', kicker: 'Controls and governance' },
  { pattern: /^\/hrms/, title: 'HRMS', kicker: 'Workforce workspace' },
] as const;

const SECTION_PATH_PREFIXES: readonly { section: PlatformSectionName; prefixes: readonly string[] }[] = [
  { section: 'Auto Aging', prefixes: ['/auto-aging'] },
  { section: 'Sales', prefixes: ['/sales'] },
  { section: 'Inventory', prefixes: ['/inventory'] },
  { section: 'Purchasing', prefixes: ['/purchasing'] },
  { section: 'Accounts', prefixes: ['/accounts'] },
  { section: 'Reports', prefixes: ['/reports'] },
  { section: 'HRMS', prefixes: ['/hrms'] },
  { section: 'Admin', prefixes: ['/admin'] },
  { section: 'Platform', prefixes: ['/portal'] },
] as const;

const MODULE_PATH_PREFIXES: readonly { moduleGate: PlatformModuleId; prefixes: readonly string[] }[] = [
  { moduleGate: 'auto-aging', prefixes: ['/auto-aging'] },
  { moduleGate: 'sales', prefixes: ['/sales'] },
  { moduleGate: 'inventory', prefixes: ['/inventory'] },
  { moduleGate: 'purchasing', prefixes: ['/purchasing'] },
  { moduleGate: 'reports', prefixes: ['/reports'] },
  { moduleGate: 'hrms', prefixes: ['/hrms'] },
  { moduleGate: 'admin', prefixes: ['/admin'] },
  { moduleGate: 'support', prefixes: ['/portal'] },
] as const;

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function routeMatchesPath(route: PlatformRouteDefinition, pathname: string): boolean {
  const routePath = route.path.replace(/\/$/, '');
  if (!routePath) return pathname === route.path;
  if (pathname === route.path || pathname.startsWith(`${routePath}/`)) return true;

  const routeSegments = routePath.replace(/^\/+/, '').split('/');
  const pathSegments = pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
  if (routeSegments.length !== pathSegments.length) return false;

  return routeSegments.every((segment, index) => segment.startsWith(':') || segment === pathSegments[index]);
}

export function getPlatformRouteById(routeId: string): PlatformRouteDefinition | null {
  return PLATFORM_ROUTES.find((route) => route.id === routeId) ?? null;
}

export function getPlatformRouteForPath(pathname: string, shells: readonly PlatformShell[] = ['main', 'portal', 'hrms']): PlatformRouteDefinition | null {
  return [...PLATFORM_ROUTES]
    .filter((candidate) => shells.includes(candidate.shell))
    .sort((a, b) => b.path.length - a.path.length)
    .find((candidate) => routeMatchesPath(candidate, pathname)) ?? null;
}

export function getFocusedPlatformSection(pathname: string): PlatformSectionName | null {
  const route = getPlatformRouteForPath(pathname, ['main', 'portal']);
  if (route) return route.section === 'Internal Requests' ? 'Platform' : route.section;

  return SECTION_PATH_PREFIXES.find(({ prefixes }) => prefixes.some((prefix) => pathMatchesPrefix(pathname, prefix)))?.section ?? null;
}

export function getModuleGateForPath(pathname: string): PlatformModuleId | null {
  const route = getPlatformRouteForPath(pathname);
  return route?.moduleGate
    ?? MODULE_PATH_PREFIXES.find(({ prefixes }) => prefixes.some((prefix) => pathMatchesPrefix(pathname, prefix)))?.moduleGate
    ?? null;
}

export function getModuleGateForSection(sectionName: string): PlatformModuleId | null {
  return PLATFORM_SECTIONS.find((section) => section.name === sectionName)?.moduleGate ?? null;
}

export function getProductionSmokeRoutes(app: PlatformShell): ProductionSmokeRoute[] {
  return PLATFORM_ROUTES
    .filter((route) => route.smoke?.app === app)
    .map((route) => ({
      module: route.section === 'Internal Requests' ? 'Internal Requests' : route.section,
      name: route.smoke?.name ?? route.label,
      path: route.smoke?.path ?? route.path,
    }));
}

export function getPlatformUnavailableCopy(
  pathname: string,
  reason: PlatformUnavailableReason,
  options: { featureName?: string; flagName?: string; routeId?: string } = {},
): PlatformUnavailableCopy {
  const route = options.routeId
    ? getPlatformRouteById(options.routeId) ?? getPlatformRouteForPath(pathname, ['main', 'portal', 'hrms'])
    : getPlatformRouteForPath(pathname, ['main', 'portal', 'hrms']);
  const featureName = options.featureName ?? route?.label ?? 'This workspace';
  const configuredDescription = route?.unavailable?.[reason];
  const controlName = options.flagName ?? route?.featureFlag;
  const flagSuffix = controlName ? ` Control: ${controlName}.` : '';

  if (configuredDescription) {
    return {
      title: `${featureName} unavailable`,
      description: `${configuredDescription}${flagSuffix}`,
    };
  }

  if (reason === 'missingPermission') {
    return {
      title: 'Access restricted',
      description: `Your role does not include access to ${featureName}. Ask an administrator to review your role, section access, or column permissions.`,
    };
  }

  if (reason === 'planned') {
    return {
      title: `${featureName} is planned`,
      description: `${featureName} is registered in the platform catalogue, but the production workflow is not ready for use yet.`,
    };
  }

  return {
    title: `${featureName} unavailable`,
    description: `${featureName} is registered in the platform catalogue, but it is disabled for this company or gated behind an inactive feature flag.${flagSuffix}`,
  };
}
