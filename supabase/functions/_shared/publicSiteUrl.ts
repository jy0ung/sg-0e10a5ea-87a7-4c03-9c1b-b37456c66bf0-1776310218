const LOCAL_HOST_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized === 'host.docker.internal'
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stripTrailingSlash(url: URL): string {
  return url.toString().replace(/\/$/, '');
}

export function resolveInviteSiteUrl({
  envSiteUrls,
  requestOrigin,
}: {
  envSiteUrls: Array<string | null | undefined>;
  requestOrigin?: string | null;
}): string {
  const requestUrl = parseUrl(requestOrigin);
  const requestOriginIsPublic = requestUrl ? !isLocalHostname(requestUrl.hostname) : false;

  for (const value of envSiteUrls) {
    const url = parseUrl(value);
    if (!url) continue;
    if (requestOriginIsPublic && isLocalHostname(url.hostname)) continue;
    return stripTrailingSlash(url);
  }

  if (requestUrl) {
    return stripTrailingSlash(requestUrl);
  }

  return 'http://localhost:3000';
}