import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useRequestCategories } from '@/hooks/useRequestCategories';
import { createTicket } from '@/services/ticketService';

const ticketSchema = z.object({
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  category: z.string().min(1, 'Category is required'),
  priority: z.enum(['low', 'medium', 'high']),
  description: z.string().min(20, 'Description must be at least 20 characters'),
});

type TicketFormData = z.infer<typeof ticketSchema>;

const PRIORITIES: { value: TicketFormData['priority']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function NewTicket() {
  const { user } = useAuth();
  const { categories, loading: categoriesLoading, error: categoriesError } = useRequestCategories(user?.company_id);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: '',
      category: '',
      priority: 'medium',
      description: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    const nextCategory = categories[0]?.key ?? '';
    const currentCategory = form.getValues('category');
    if (!currentCategory && nextCategory) {
      form.setValue('category', nextCategory, { shouldValidate: true });
      return;
    }
    if (currentCategory && !categories.some((category) => category.key === currentCategory)) {
      form.setValue('category', nextCategory, { shouldValidate: true });
    }
  }, [categories, form]);

  const handleSubmit = async (data: TicketFormData) => {
    if (!user) return;
    if (!categories.some((category) => category.key === data.category && category.is_active)) {
      toast.error('Unable to submit request', {
        description: 'This category is no longer available. Please choose another one.',
      });
      return;
    }

    setSubmitting(true);
    const { error } = await createTicket({
      subject: data.subject,
      category: data.category,
      priority: data.priority,
      description: data.description,
    }, {
      userId: user.id,
      companyId: user.company_id,
    });
    if (error) {
      toast.error('Failed to submit request', {
        description: error.message || 'An unexpected error occurred.',
      });
    } else {
      toast.success('Request submitted successfully', {
        description: 'Your internal request has been recorded and will be reviewed shortly.',
      });
      form.reset({
        subject: '',
        category: categories[0]?.key ?? '',
        priority: 'medium',
        description: '',
      });
    }
    setSubmitting(false);
  };

  const selectedCategory = categories.find((category) => category.key === form.watch('category')) ?? null;
  const categorySelectionDisabled = categoriesLoading || categories.length === 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Create Internal Request</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fill in the details below to submit an internal request.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Details</CardTitle>
          <CardDescription>
            Provide as much detail as possible so the assigned team can respond quickly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(categoriesError || (!categoriesLoading && categories.length === 0)) && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Request categories are not ready</p>
                <p className="text-muted-foreground">
                  {categoriesError || 'An admin needs to configure at least one active request category in Request Setup before new requests can be submitted.'}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="subject">Subject <span className="text-destructive">*</span></Label>
              <Input
                id="subject"
                placeholder="Brief summary of your request"
                {...form.register('subject')}
                className={form.formState.errors.subject ? 'border-destructive' : ''}
              />
              {form.formState.errors.subject && (
                <p className="text-destructive text-xs">{form.formState.errors.subject.message}</p>
              )}
            </div>

            {/* Category & Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category <span className="text-destructive">*</span></Label>
                <Select
                  value={form.watch('category')}
                  onValueChange={(v) => form.setValue('category', v as TicketFormData['category'], { shouldValidate: true })}
                  disabled={categorySelectionDisabled}
                >
                  <SelectTrigger id="category" className={form.formState.errors.category ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(({ key, label }) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {categoriesLoading ? 'Loading available categories...' : selectedCategory?.description ?? 'Select a category to see when it should be used.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority <span className="text-destructive">*</span></Label>
                <Select
                  value={form.watch('priority')}
                  onValueChange={(v) => form.setValue('priority', v as TicketFormData['priority'], { shouldValidate: true })}
                >
                  <SelectTrigger id="priority" className={form.formState.errors.priority ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
              <Textarea
                id="description"
                placeholder="Please describe your issue or request in detail..."
                rows={6}
                {...form.register('description')}
                className={form.formState.errors.description ? 'border-destructive' : ''}
              />
              {form.formState.errors.description && (
                <p className="text-destructive text-xs">{form.formState.errors.description.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Minimum 20 characters. {form.watch('description')?.length ?? 0} entered.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !form.formState.isValid || categorySelectionDisabled}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
              ) : (
                'Submit Request'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
