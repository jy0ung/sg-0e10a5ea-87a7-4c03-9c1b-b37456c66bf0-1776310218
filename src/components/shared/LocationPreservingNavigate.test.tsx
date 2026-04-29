import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LocationPreservingNavigate } from './LocationPreservingNavigate';

function LocationProbe() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}${location.hash}`}</div>;
}

describe('LocationPreservingNavigate', () => {
  it('preserves query strings and hashes when redirecting to a clean path', async () => {
    render(
      <MemoryRouter initialEntries={['/legacy?view=team#month']}>
        <Routes>
          <Route path="/legacy" element={<LocationPreservingNavigate to="/target" />} />
          <Route path="/target" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('/target?view=team#month')).toBeInTheDocument();
  });

  it('does not overwrite an explicit target query or hash', async () => {
    render(
      <MemoryRouter initialEntries={['/legacy?view=team#month']}>
        <Routes>
          <Route path="/legacy" element={<LocationPreservingNavigate to="/target?mode=admin#top" />} />
          <Route path="/target" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('/target?mode=admin#top')).toBeInTheDocument();
  });
});