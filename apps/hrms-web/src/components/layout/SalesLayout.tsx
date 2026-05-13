import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { PageSpinner } from '@/components/shared/PageSpinner';

// SalesProvider is now hoisted to the ProtectedAppShell in main.tsx so the
// `/` and `/sales/*` subtrees share one instance (Phase 2 #16).
export default function SalesLayout() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Outlet />
    </Suspense>
  );
}
