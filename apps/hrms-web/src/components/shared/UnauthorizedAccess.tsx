import React from 'react';
import { ShieldOff } from 'lucide-react';

export function UnauthorizedAccess() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldOff className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          You don't have permission to view this page. Contact your administrator if you believe this is an error.
        </p>
      </div>
    </div>
  );
}
