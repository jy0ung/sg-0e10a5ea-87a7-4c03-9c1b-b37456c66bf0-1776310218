import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StandardTable } from './StandardTable';

interface Row {
  id: string;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: '1', name: 'Beta Branch', status: 'inactive' },
  { id: '2', name: 'Alpha Branch', status: 'active' },
  { id: '3', name: 'Gamma Branch', status: 'active' },
];

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
];

describe('StandardTable', () => {
  it('filters rows and renders the empty state', () => {
    render(
      <StandardTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search branches"
        emptyMessage="No branches found"
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search branches' }), { target: { value: 'alpha' } });

    // Phase 5d: both the desktop <table> and the mobile <ul> exist in JSDOM
    // (Tailwind media queries don't evaluate without a layout engine), so the
    // visible row appears twice. The intent of the test is "matched row is
    // shown, non-matched row is hidden" — assert against the desktop table
    // to keep the assertion deterministic.
    const table = screen.getByRole('table');
    expect(within(table).getByText('Alpha Branch')).toBeInTheDocument();
    expect(within(table).queryByText('Beta Branch')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search branches' }), { target: { value: 'missing' } });
    expect(screen.getByText('No branches found')).toBeInTheDocument();
  });

  it('sorts and paginates client-side rows', () => {
    render(
      <StandardTable
        data={rows}
        columns={columns}
        pageSizes={[2]}
        searchPlaceholder="Search branches"
      />,
    );

    fireEvent.click(within(screen.getByRole('table')).getByText('Name'));
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Alpha Branch',
      'active',
      'Beta Branch',
      'inactive',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Gamma Branch')).toBeInTheDocument();
    expect(within(table).queryByText('Alpha Branch')).not.toBeInTheDocument();
  });

  it('exposes accessible selection controls', () => {
    const onSelectionChange = vi.fn();

    render(
      <StandardTable
        data={rows.slice(0, 1)}
        columns={columns}
        hideSearch
        selectable
        onSelectionChange={onSelectionChange}
      />,
    );

    // Phase 5d: both desktop + mobile views render checkboxes; click the
    // first instance (desktop) which represents the same row.
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);

    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1']));
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeInTheDocument();
  });

  it('renders a stacked card list (mobile layout) with label–value pairs per row', () => {
    render(
      <StandardTable
        data={rows.slice(0, 2)}
        columns={columns}
        hideSearch
      />,
    );

    const mobileList = screen.getByTestId('standard-table-mobile-list');
    expect(mobileList.tagName).toBe('UL');

    const cards = within(mobileList).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Name')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Beta Branch')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Status')).toBeInTheDocument();
    expect(within(cards[0]).getByText('inactive')).toBeInTheDocument();
  });

  it('mobile card layout forwards clicks to onRowClick', () => {
    const onRowClick = vi.fn();
    render(
      <StandardTable
        data={rows.slice(0, 1)}
        columns={columns}
        hideSearch
        onRowClick={onRowClick}
      />,
    );

    fireEvent.click(screen.getByTestId('standard-table-mobile-row-1'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});
