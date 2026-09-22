import {
  createSalesAdvisor as createCanonicalSalesAdvisor,
  listSalesAdvisors as listCanonicalSalesAdvisors,
  updateSalesAdvisorStatus as updateCanonicalSalesAdvisorStatus,
  type CreateSalesAdvisorInput,
  type SalesAdvisorRecord,
  type SalesAdvisorStatus,
} from '@flc/hrms-services';
import { loggingService } from './loggingService';
import { logUserAction } from './auditService';

export type {
  CreateSalesAdvisorInput,
  SalesAdvisorRecord,
  SalesAdvisorStatus,
} from '@flc/hrms-services';

export async function listSalesAdvisors(companyId: string): Promise<SalesAdvisorRecord[]> {
  try {
    return await listCanonicalSalesAdvisors(companyId);
  } catch (error) {
    loggingService.error('listSalesAdvisors failed', { companyId, error }, 'SalesAdvisorService');
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function createSalesAdvisor(
  input: CreateSalesAdvisorInput,
): Promise<{ error: Error | null }> {
  try {
    await createCanonicalSalesAdvisor(input);
    return { error: null };
  } catch (error) {
    loggingService.error('createSalesAdvisor failed', { error }, 'SalesAdvisorService');
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export async function updateSalesAdvisorStatus(
  companyId: string,
  id: string,
  status: SalesAdvisorStatus,
  actorId?: string,
): Promise<{ error: Error | null }> {
  try {
    await updateCanonicalSalesAdvisorStatus(companyId, id, status);
    if (actorId) void logUserAction(actorId, 'update', 'sales_advisor', id, { status });
    return { error: null };
  } catch (error) {
    loggingService.error('updateSalesAdvisorStatus failed', { id, error }, 'SalesAdvisorService');
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
}
