// Test-only bundle: real shared consumers, no replacement implementations or API.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '../../packages/ui/src/carousel';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../packages/ui/src/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '../../packages/ui/src/alert-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../packages/ui/src/select';

const root = document.getElementById('root')!;
const scene = root.dataset.scene;
const vertical = scene !== 'horizontal';
const override = scene === 'override' ? 'h-10 w-10 rotate-0 translate-x-0 scale-100' : undefined;
createRoot(root).render(scene === 'dialog' ? (
  <Dialog defaultOpen><DialogContent><DialogTitle>Transform dialog</DialogTitle><DialogDescription>Actual animated shared dialog.</DialogDescription></DialogContent></Dialog>
) : scene === 'alert' ? (
  <AlertDialog defaultOpen><AlertDialogContent><AlertDialogTitle>Transform alert</AlertDialogTitle><AlertDialogDescription>Actual animated shared alert.</AlertDialogDescription><AlertDialogCancel>Cancel alert</AlertDialogCancel></AlertDialogContent></AlertDialog>
) : scene === 'select' ? (
  <div style={{ width: 200, margin: 100 }}><Select defaultOpen><SelectTrigger aria-label="Transform selection"><SelectValue placeholder="Select a value" /></SelectTrigger><SelectContent><SelectItem value="first">First value</SelectItem><SelectItem value="second">Second value</SelectItem></SelectContent></Select></div>
) : (
  <Carousel orientation={vertical ? 'vertical' : 'horizontal'} style={{ width: 400, height: 200, margin: 100 }} data-testid="transform-carousel">
    <CarouselContent style={{ height: 200 }}>{[1, 2, 3].map(n => <CarouselItem key={n} style={{ height: 200 }}>Slide {n}</CarouselItem>)}</CarouselContent>
    <CarouselPrevious id="previous" className={override} /><CarouselNext id="next" className={override} />
  </Carousel>
));
