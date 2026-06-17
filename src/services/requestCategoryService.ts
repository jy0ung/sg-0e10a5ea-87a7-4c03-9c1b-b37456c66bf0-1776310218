// Compatibility re-export: internal request category behavior is owned by @flc/internal-requests.
export {
  createRequestCategory,
  deleteRequestCategory,
  listRequestCategories,
  moveRequestCategory,
  reorderRequestCategories,
  updateRequestCategory,
} from '@flc/internal-requests';
export type {
  CreateRequestCategoryInput,
  DeleteRequestCategoryResult,
  ListRequestCategoriesOptions,
  RequestCategoryContext,
  RequestCategoryRecord,
  UpdateRequestCategoryInput,
} from '@flc/internal-requests';
