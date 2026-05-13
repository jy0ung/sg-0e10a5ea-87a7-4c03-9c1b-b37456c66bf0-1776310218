import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from '@flc/hrms-services';
import { announcementKeys } from '../queryKeys';

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useAnnouncements(
  companyId: string,
  opts?: Parameters<typeof listAnnouncements>[1],
) {
  return useQuery({
    queryKey: announcementKeys.all(companyId),
    queryFn: () => listAnnouncements(companyId, opts),
    enabled: Boolean(companyId),
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreateAnnouncement(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      actorId,
      input,
    }: {
      actorId: string;
      input: Parameters<typeof createAnnouncement>[2];
    }) => createAnnouncement(companyId, actorId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementKeys.all(companyId) });
    },
  });
}

export function useDeleteAnnouncement(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id, companyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementKeys.all(companyId) });
    },
  });
}
