import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { SalesProvider } from '@/contexts/SalesContext';

const PageSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

export default function SalesLayout() {
  return (
    <SalesProvider>
      <Suspense fallback={<PageSpinner />}>
        <Outlet />
      </Suspense>
    </SalesProvider>
  );
}
