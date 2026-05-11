/**
 * salesOrderService — barrel re-export.
 *
 * All implementation has been split into focused modules:
 *   salesOrderCrudService    — CRUD + realtime subscription
 *   salesPipelineService     — stage transitions, vehicle linking, pipeline summary
 *   salesDashboardService    — getSalesDashboardSummary
 *
 * This file re-exports everything so existing import paths continue to work
 * without change.
 */
export * from './salesOrderCrudService';
export * from './salesPipelineService';
export * from './salesDashboardService';
