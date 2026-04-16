import React from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { AuditLogViewer } from '@/components/admin/AuditLogViewer';

export default function AuditLog() {
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