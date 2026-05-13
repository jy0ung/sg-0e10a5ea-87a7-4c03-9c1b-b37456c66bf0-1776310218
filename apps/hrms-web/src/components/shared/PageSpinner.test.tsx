import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageSpinner } from './PageSpinner';

describe('PageSpinner', () => {
  it('renders an accessible page loading status', () => {
    render(<PageSpinner label="Loading HRMS" />);

    expect(screen.getByRole('status', { name: 'Loading HRMS' })).toBeInTheDocument();
  });
});