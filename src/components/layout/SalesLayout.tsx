import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

// SalesProvider is now hoisted to the ProtectedAppShell in main.tsx so the
// `/` and `/sales/*` subtrees share one instance (Phase 2 #16).
const PageSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

export default function SalesLayout() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Outlet />
    </Suspense>
  );
}
