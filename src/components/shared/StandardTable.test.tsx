import { fireEvent, render, screen } from '@testing-library/react';
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

    expect(screen.getByText('Alpha Branch')).toBeInTheDocument();
    expect(screen.queryByText('Beta Branch')).not.toBeInTheDocument();

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

    fireEvent.click(screen.getByText('Name'));
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Alpha Branch',
      'active',
      'Beta Branch',
      'inactive',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Gamma Branch')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Branch')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));

    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1']));
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeInTheDocument();
  });
});
