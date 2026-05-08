type FetchLike = typeof fetch;

const verifyFetchTimeoutMs = 8000;

function fallbackRedirectForVerifyUrl(currentHref: string) {
  const url = new URL(currentHref);
  const type = url.searchParams.get('type');
  const params = new URLSearchParams({
    error: 'access_denied',
    error_code: 'auth_verify_unavailable',
    error_description: 'Unable to verify this email link. Request a new link and try again.',
  });

  if (type === 'recovery') return `/reset-password?${params.toString()}`;
  if (type === 'invite' || type === 'signup' || type === 'magiclink') return `/signup?${params.toString()}`;
  return `/login?${params.toString()}`;
}

export async function resolveAuthVerifyRedirect(
  currentHref: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = verifyFetchTimeoutMs,
) {
  const currentUrl = new URL(currentHref);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetchImpl(currentHref, {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    });
  } catch {
    return fallbackRedirectForVerifyUrl(currentHref);
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.redirected && response.url && response.url !== currentHref) {
    const redirectUrl = new URL(response.url, currentUrl.origin);
    if (redirectUrl.origin === currentUrl.origin) {
      return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
    }
    return redirectUrl.toString();
  }

  return fallbackRedirectForVerifyUrl(currentHref);
}
