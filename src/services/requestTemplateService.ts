// Compatibility re-export: internal request template behavior is owned by @flc/internal-requests.
export {
  createRequestTemplate,
  deleteRequestTemplate,
  listRequestTemplates,
  moveRequestTemplate,
  updateRequestTemplate,
} from '@flc/internal-requests';
export type {
  CreateRequestTemplateInput,
  ListRequestTemplatesOptions,
  RequestTemplateContext,
  RequestTemplateRecord,
  TemplatePriority,
  UpdateRequestTemplateInput,
} from '@flc/internal-requests';
