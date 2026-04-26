import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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
import { createTicket } from '@/services/ticketService';

const ticketSchema = z.object({
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  category: z.enum(['sales_inquiry', 'technical_issue', 'service_request', 'general', 'other']),
  priority: z.enum(['low', 'medium', 'high']),
  description: z.string().min(20, 'Description must be at least 20 characters'),
});

type TicketFormData = z.infer<typeof ticketSchema>;

const CATEGORIES: { value: TicketFormData['category']; label: string }[] = [
  { value: 'sales_inquiry', label: 'Sales Inquiry' },
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'service_request', label: 'Service Request' },
  { value: 'general', label: 'General' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES: { value: TicketFormData['priority']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function NewTicket() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: '',
      category: 'general',
      priority: 'medium',
      description: '',
    },
    mode: 'onChange',
  });

  const handleSubmit = async (data: TicketFormData) => {
    if (!user) return;
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
      toast.error('Failed to submit ticket', {
        description: error.message || 'An unexpected error occurred.',
      });
    } else {
      toast.success('Ticket submitted successfully', {
        description: 'Your ticket has been raised and will be reviewed shortly.',
      });
      form.reset();
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Raise a Ticket</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fill in the details below to submit a support request.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ticket Details</CardTitle>
          <CardDescription>
            Provide as much detail as possible so we can assist you efficiently.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                >
                  <SelectTrigger id="category" className={form.formState.errors.category ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              disabled={submitting || !form.formState.isValid}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
              ) : (
                'Submit Ticket'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
