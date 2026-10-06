// Test-only entry, served by Vite development; absent from all production build inputs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { Button } from '../../packages/ui/src/button';
import { Input } from '../../packages/ui/src/input';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../../packages/ui/src/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../packages/ui/src/tabs';
import { Popover, PopoverTrigger, PopoverContent } from '../../packages/ui/src/popover';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../../packages/ui/src/dialog';

createRoot(document.getElementById('root')!).render(
  <main className="container space-y-4 p-6">
    <div data-testid="sibling-spacing" className="space-y-6"><div hidden>Hidden</div><div className="mt-4">First visible sibling</div><div>Second visible sibling</div></div>
    <h1 className="text-xl font-semibold">Owned shared UI compatibility fixture</h1>
    <form onSubmit={event => { event.preventDefault(); event.currentTarget.dataset.submitted = 'true'; }}>
      <Input aria-label="Required fixture input" required className="border-destructive focus-visible:ring-primary" />
      <Button type="submit" className="h-10 px-6 text-lg text-warning shadow-sm">Class overrides</Button>
      <Button disabled>Disabled fixture</Button>
    </form>
    <Tabs defaultValue="first">
      <TabsList><TabsTrigger value="first">First tab</TabsTrigger><TabsTrigger value="second">Second tab</TabsTrigger></TabsList>
      <TabsContent value="first">First panel</TabsContent><TabsContent value="second">Second panel</TabsContent>
    </Tabs>
    <Accordion type="single" collapsible><AccordionItem value="details">
      <AccordionTrigger>Expandable details</AccordionTrigger><AccordionContent>Accordion content</AccordionContent>
    </AccordionItem></Accordion>
    <Popover><PopoverTrigger asChild><Button variant="outline">Open popover</Button></PopoverTrigger>
      <PopoverContent>Positioned popover</PopoverContent></Popover>
    <Dialog><DialogTrigger asChild><Button>Open fixture dialog</Button></DialogTrigger>
      <DialogContent><DialogTitle>Fixture dialog</DialogTitle><DialogDescription>Focus returns to its trigger on close.</DialogDescription><Input aria-label="Dialog input" /></DialogContent>
    </Dialog>
  </main>,
);
