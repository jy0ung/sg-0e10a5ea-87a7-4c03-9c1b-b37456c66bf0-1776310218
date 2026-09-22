import {
  createApprovalFlow as createCanonicalApprovalFlow,
  deleteApprovalFlow as deleteCanonicalApprovalFlow,
  listApprovalApproverProfiles as listCanonicalApprovalApproverProfiles,
  listApprovalDepartments as listCanonicalApprovalDepartments,
  listApprovalFlows as listCanonicalApprovalFlows,
  toggleApprovalFlowActive as toggleCanonicalApprovalFlowActive,
  updateApprovalFlow as updateCanonicalApprovalFlow,
} from '@flc/hrms-services';
import { logUserAction } from '@/services/auditService';
import type {
  ApprovalFlow,
  CreateApprovalFlowInput,
  UpdateApprovalFlowInput,
} from '@/types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function listApprovalFlows(
  companyId: string,
): Promise<{ data: ApprovalFlow[]; error: string | null }> {
  try {
    return { data: await listCanonicalApprovalFlows(companyId), error: null };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function createApprovalFlow(
  companyId: string,
  actorId: string,
  input: CreateApprovalFlowInput,
): Promise<{ data: ApprovalFlow | null; error: string | null }> {
  try {
    const data = await createCanonicalApprovalFlow(companyId, input);
    void logUserAction(actorId, 'create', 'approval_flow', data.id, {
      name: input.name,
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
}

export async function updateApprovalFlow(
  flowId: string,
  companyId: string,
  actorId: string,
  input: UpdateApprovalFlowInput,
): Promise<{ error: string | null }> {
  try {
    await updateCanonicalApprovalFlow(companyId, flowId, input);
    void logUserAction(actorId, 'update', 'approval_flow', flowId, {
      name: input.name,
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function toggleApprovalFlowActive(
  companyId: string,
  flowId: string,
  isActive: boolean,
  actorId: string,
): Promise<{ error: string | null }> {
  try {
    await toggleCanonicalApprovalFlowActive(
      companyId,
      flowId,
      isActive,
      actorId,
    );
    void logUserAction(actorId, 'update', 'approval_flow', flowId, {
      isActive,
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function deleteApprovalFlow(
  companyId: string,
  flowId: string,
  actorId: string,
): Promise<{ error: string | null }> {
  try {
    await deleteCanonicalApprovalFlow(companyId, flowId);
    void logUserAction(actorId, 'delete', 'approval_flow', flowId, {});
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/**
 * Compatibility name retained for the HRMS Approval Flow editor.
 * The returned IDs are authenticated Profile IDs, because specific-user
 * approval routing targets a login identity, not a workforce-only Employee.
 */
export async function listEmployeesForSelect(
  companyId: string,
): Promise<{ data: { id: string; name: string }[]; error: string | null }> {
  try {
    return {
      data: await listCanonicalApprovalApproverProfiles(companyId),
      error: null,
    };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

export async function listDepartmentsForSelect(
  companyId: string,
): Promise<{ data: { id: string; name: string }[]; error: string | null }> {
  try {
    return {
      data: await listCanonicalApprovalDepartments(companyId),
      error: null,
    };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}
