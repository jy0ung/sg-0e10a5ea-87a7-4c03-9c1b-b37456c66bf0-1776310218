import { useCallback, useState } from 'react';
import { Route, Settings2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';

import { AttachmentSettingsEditor } from './request-setup/AttachmentSettingsEditor';
import { CategoryEditor } from './request-setup/CategoryEditor';
import { FormFieldEditor } from './request-setup/FormFieldEditor';
import { RoutingEditor } from './request-setup/RoutingEditor';
import { TemplateEditor } from './request-setup/TemplateEditor';

/**
 * Request Operations Setup — the admin console for the Internal Service
 * Request module. Used to be a single 2,785-line file owning every editor's
 * state. Now it's a thin shell: five sibling editors under `request-setup/`
 * each own their own data, drafts, and handlers. The shell only:
 *
 *  - resolves the authenticated user/companyId
 *  - holds active-record counts surfaced by each editor (for the tab badges
 *    and the summary cards at the top)
 *  - lays out the tab triggers and content panels
 *
 * If a new editor needs to be added (e.g. a future "subcategory templates"
 * editor or "SLA presets" editor), drop another sibling under request-setup/
 * and add one TabsTrigger + TabsContent pair below.
 */
export default function RequestSetup() {
  const { user } = useAuth();

  const [activeCounts, setActiveCounts] = useState({
    categories: 0,
    templates: 0,
    fields: 0,
    rules: 0,
  });

  const setCategoryCount = useCallback(
    (count: number) => setActiveCounts((prev) => ({ ...prev, categories: count })),
    [],
  );
  const setTemplateCount = useCallback(
    (count: number) => setActiveCounts((prev) => ({ ...prev, templates: count })),
    [],
  );
  const setFieldCount = useCallback(
    (count: number) => setActiveCounts((prev) => ({ ...prev, fields: count })),
    [],
  );
  const setRuleCount = useCallback(
    (count: number) => setActiveCounts((prev) => ({ ...prev, rules: count })),
    [],
  );

  if (!user?.company_id) return null;

  const companyId = user.company_id;
  const actorId = user.id;

  return (
    <div className="w-full space-y-4">
      <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Internal Requests</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Request Operations Setup</h1>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
              Shape the requester experience, routing logic, templates, and attachment controls from one workspace.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 text-center sm:w-auto sm:min-w-[460px] sm:grid-cols-4">
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-lg font-semibold tabular-nums text-foreground">{activeCounts.categories}</p>
              <p className="text-[11px] text-muted-foreground">Categories</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-lg font-semibold tabular-nums text-foreground">{activeCounts.templates}</p>
              <p className="text-[11px] text-muted-foreground">Templates</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-lg font-semibold tabular-nums text-foreground">{activeCounts.fields}</p>
              <p className="text-[11px] text-muted-foreground">Fields</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-lg font-semibold tabular-nums text-foreground">{activeCounts.rules}</p>
              <p className="text-[11px] text-muted-foreground">Rules</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>Request Customization</CardTitle>
          <CardDescription>
            Manage categories, subcategories, and templates from one canvas. Changes take effect immediately for new requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <Tabs defaultValue="categories">
            <div className="mb-4 overflow-x-auto">
              <TabsList className="inline-flex h-auto min-w-max rounded-lg border bg-card p-1 shadow-sm">
                <TabsTrigger value="categories">
                  Categories
                  {activeCounts.categories > 0 && (
                    <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                      {activeCounts.categories}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="templates">
                  Templates
                  {activeCounts.templates > 0 && (
                    <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                      {activeCounts.templates}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="forms">
                  Form Builder
                  {activeCounts.fields > 0 && (
                    <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                      {activeCounts.fields}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                  Settings
                </TabsTrigger>
                <TabsTrigger value="routing">
                  <Route className="mr-1.5 h-3.5 w-3.5" />
                  Routing
                  {activeCounts.rules > 0 && (
                    <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
                      {activeCounts.rules}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="categories" className="space-y-4">
              <CategoryEditor
                companyId={companyId}
                actorId={actorId}
                onActiveCountChange={setCategoryCount}
              />
            </TabsContent>

            <TabsContent value="templates" className="space-y-4">
              <TemplateEditor
                companyId={companyId}
                actorId={actorId}
                onActiveCountChange={setTemplateCount}
              />
            </TabsContent>

            <TabsContent value="forms" className="space-y-4">
              <FormFieldEditor
                companyId={companyId}
                actorId={actorId}
                onActiveCountChange={setFieldCount}
              />
            </TabsContent>

            <TabsContent value="routing" className="space-y-4">
              <RoutingEditor
                companyId={companyId}
                actorId={actorId}
                onActiveCountChange={setRuleCount}
              />
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <AttachmentSettingsEditor companyId={companyId} actorId={actorId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
