import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SLAAdmin from './SLAAdmin';

const mockUpdateSla = vi.fn();
const mockUseData = vi.fn();

vi.mock('@/contexts/DataContext', () => ({
  useData: () => mockUseData(),
}));

describe('SLAAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseData.mockReturnValue({
      slas: [
        {
          id: 'sla-1',
          kpiId: 'bg_to_delivery',
          label: 'BG -> Delivery',
          slaDays: 45,
          companyId: 'company-1',
        },
        {
          id: 'sla-2',
          kpiId: 'bg_to_disb',
          label: 'BG -> Disbursement',
          slaDays: 60,
          companyId: 'company-1',
        },
      ],
      updateSla: mockUpdateSla,
    });
  });

  it('enables save for edited rows and persists the changed SLA value', () => {
    render(<SLAAdmin />);

    const deliveryRow = screen.getByText('BG -> Delivery').closest('tr');
    const disbursementRow = screen.getByText('BG -> Disbursement').closest('tr');

    expect(deliveryRow).not.toBeNull();
    expect(disbursementRow).not.toBeNull();

    const deliverySaveButton = within(deliveryRow as HTMLTableRowElement).getByRole('button', { name: /save/i });
    const disbursementSaveButton = within(disbursementRow as HTMLTableRowElement).getByRole('button', { name: /save/i });

    expect(deliverySaveButton).toBeDisabled();
    expect(disbursementSaveButton).toBeDisabled();

    fireEvent.change(within(deliveryRow as HTMLTableRowElement).getByRole('spinbutton'), {
      target: { value: '52' },
    });

    expect(deliverySaveButton).toBeEnabled();
    expect(disbursementSaveButton).toBeDisabled();

    fireEvent.click(deliverySaveButton);

    expect(mockUpdateSla).toHaveBeenCalledWith('sla-1', 52);
    expect(mockUpdateSla).toHaveBeenCalledTimes(1);
    expect(deliverySaveButton).toBeDisabled();
  });
});