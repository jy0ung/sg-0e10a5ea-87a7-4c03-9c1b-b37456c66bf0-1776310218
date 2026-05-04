#!/usr/bin/env -S npx tsx
/**
 * Seed request categories tailored for a vehicle service centre.
 * Deletes ALL existing categories (cascades to subcategories) and
 * request_templates for every real company tenant, then inserts a
 * clean set appropriate for Service Operations, Sales, Accounts, Finance.
 *
 * Usage:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx tsx scripts/seed-request-categories.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('[seed] Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Category definitions ──────────────────────────────────────────────────────

const CATEGORIES = [
  {
    category_key: 'service_operations',
    label: 'Service & Workshop',
    description: 'Workshop job cards, technician allocation, bay scheduling and repair follow-ups.',
    sort_order: 1,
  },
  {
    category_key: 'sales',
    label: 'Sales',
    description: 'Vehicle sales requests, trade-in valuations, delivery coordination and sales support.',
    sort_order: 2,
  },
  {
    category_key: 'accounts',
    label: 'Accounts',
    description: 'Customer invoicing, payments, collections, receipts and account reconciliation.',
    sort_order: 3,
  },
  {
    category_key: 'finance',
    label: 'Finance',
    description: 'Hire-purchase, loan processing, insurance claims and financial approvals.',
    sort_order: 4,
  },
  {
    category_key: 'parts_inventory',
    label: 'Parts & Inventory',
    description: 'Spare parts requests, stock transfers, procurement and inventory discrepancies.',
    sort_order: 5,
  },
  {
    category_key: 'hr_admin',
    label: 'HR & Administration',
    description: 'Leave applications, staff claims, policy queries and general administrative support.',
    sort_order: 6,
  },
  {
    category_key: 'it_systems',
    label: 'IT & Systems',
    description: 'System access requests, DMS/CRM issues, hardware faults and IT support.',
    sort_order: 7,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  // Discover all distinct company tenants that currently have categories
  const { data: existingCats, error: listErr } = await admin
    .from('request_categories')
    .select('company_id');

  if (listErr) {
    console.error('[seed] Failed to list existing categories:', listErr.message);
    process.exit(1);
  }

  const companyIds = [...new Set((existingCats ?? []).map((r: { company_id: string }) => r.company_id))];
  console.info(`[seed] Tenants to reseed: ${companyIds.join(', ')}`);

  for (const companyId of companyIds) {
    console.info(`\n[seed] ── ${companyId} ─────────────────────`);

    // 1. Delete templates (may not cascade from categories in all setups)
    const { error: tmplErr } = await admin
      .from('request_templates')
      .delete()
      .eq('company_id', companyId);
    if (tmplErr) {
      console.warn(`[seed]   Warning: Could not delete templates for ${companyId}: ${tmplErr.message}`);
    } else {
      console.info(`[seed]   Deleted templates`);
    }

    // 2. Delete categories (cascades to subcategories via FK)
    const { error: catErr } = await admin
      .from('request_categories')
      .delete()
      .eq('company_id', companyId);
    if (catErr) {
      console.error(`[seed]   Error deleting categories for ${companyId}: ${catErr.message}`);
      continue;
    }
    console.info(`[seed]   Deleted existing categories`);

    // 3. Insert new categories
    const rows = CATEGORIES.map((cat) => ({
      ...cat,
      company_id: companyId,
      is_active: true,
    }));

    const { error: insertErr } = await admin.from('request_categories').insert(rows);
    if (insertErr) {
      console.error(`[seed]   Error inserting categories for ${companyId}: ${insertErr.message}`);
      continue;
    }
    console.info(`[seed]   Inserted ${rows.length} categories`);
  }

  console.info('\n[seed] Done.');
}

void run();
