import { expect, test } from '@playwright/test';
import { MOCK_PROFILE, setupAuthMocks, SUPABASE_URL } from './helpers/auth-mock';

test('invoice creation selects a canonical approved PO line and sends its ID', async ({ page }) => {
  await setupAuthMocks(page);
  const poId = '11111111-1111-4111-8111-111111111111';
  const lineId = '22222222-2222-4222-8222-222222222222';
  let submittedLineId = '';
  const fulfill = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(`${SUPABASE_URL}/rest/v1/purchase_orders*`, route => route.fulfill(fulfill([
    { id: poId, company_id: MOCK_PROFILE.company_id, po_no: 'PO-UAT-001', supplier: 'UAT Supplier', lifecycle_status: 'approved' },
  ])));
  await page.route(`${SUPABASE_URL}/rest/v1/purchase_order_lines*`, route => route.fulfill(fulfill([
    { id: lineId, purchase_order_id: poId, line_no: 1, model: 'X50', chassis_no: 'UATCHASSIS1', quantity: 2, unit_price: 40000 },
  ])));
  await page.route(`${SUPABASE_URL}/rest/v1/grn_lines*`, route => route.fulfill(fulfill([
    { purchase_order_line_id: lineId, received_quantity: 1 },
  ])));
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_ap_aging_summary*`, route => route.fulfill(fulfill([])));
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/create_linked_purchase_invoice*`, async route => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { p_po_line_id: string };
    submittedLineId = body.p_po_line_id;
    await route.fulfill(fulfill('33333333-3333-4333-8333-333333333333'));
  });

  await page.goto('/purchasing/invoices', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'New Invoice' }).click();
  await page.locator('#purchase-invoice-no').fill('PI-UAT-001');
  await page.locator('#purchase-invoice-supplier').fill('UAT Supplier');
  await page.locator('#purchase-invoice-chassis-no').fill('UATCHASSIS1');
  await page.locator('#purchase-invoice-model').fill('X50');
  await page.locator('#purchase-invoice-amount').fill('80000');
  await page.locator('#invoice-po').click();
  await page.getByRole('option', { name: /PO-UAT-001/ }).click();
  await page.getByRole('button', { name: 'Create Invoice' }).click();
  await expect(page.getByText('Choose a PO line for the selected order')).toBeVisible();
  await page.locator('#invoice-po-line').click();
  await page.getByRole('option', { name: /#1 · X50 · UATCHASSIS1/ }).click();
  await expect(page.getByText(/ordered 2 · received 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Create Invoice' }).click();
  await expect.poll(() => submittedLineId).toBe(lineId);
  await expect(page.getByText('Purchase invoice created')).toBeVisible();
});
