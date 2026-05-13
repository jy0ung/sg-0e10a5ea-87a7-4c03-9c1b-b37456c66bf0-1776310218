import { Navigate, type To, useLocation } from 'react-router-dom';

function withCurrentLocation(to: To, search: string, hash: string): To {
  if (typeof to !== 'string') {
    return {
      ...to,
      search: to.search ?? search,
      hash: to.hash ?? hash,
    };
  }

  const nextSearch = search && !to.includes('?') ? search : '';
  const nextHash = hash && !to.includes('#') ? hash : '';
  return `${to}${nextSearch}${nextHash}`;
}

export function LocationPreservingNavigate({
  to,
  replace = true,
  state,
}: {
  to: To;
  replace?: boolean;
  state?: unknown;
}) {
  const location = useLocation();
  return (
    <Navigate
      to={withCurrentLocation(to, location.search, location.hash)}
      replace={replace}
      state={state}
    />
  );
}