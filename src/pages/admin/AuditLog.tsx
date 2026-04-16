import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { AuditLogViewer } from '@/components/admin/AuditLogViewer';
import { useAuth } from '@/contexts/AuthContext';
import { UnauthorizedAccess } from '@/components/shared/UnauthorizedAccess';

export default function AuditLog() {
  const { hasRole } = useAuth();
  if (!hasRole(['super_admin', 'company_admin', 'director'])) return <UnauthorizedAccess />;
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Audit Log" 
        description="Track all system actions and changes" 
        breadcrumbs={[
          { label: 'FLC BI' }, 
          { label: 'Admin' }, 
          { label: 'Audit Log' }
        ]} 
      />
      <AuditLogViewer entityType="all" />
    </div>
  );
}