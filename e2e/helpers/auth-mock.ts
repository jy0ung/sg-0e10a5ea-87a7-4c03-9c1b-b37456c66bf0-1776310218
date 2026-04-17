/**
 * Helper that mocks all Supabase API calls and injects a fake admin session
 * into localStorage so the app treats the browser as already signed-in.
 *
 * Usage:
 *   import { setupAuthMocks, MOCK_USER } from './helpers/auth-mock';
 *   test('...', async ({ page }) => {
 *     await setupAuthMocks(page);
 *     await page.goto('/');
 *   });
 */
import type { Page } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// Read VITE_SUPABASE_URL from the project .env file so the mock targets the
// same Supabase instance the app talks to at runtime.
function readSupabaseUrl(): string {
  try {
    const envPath = resolve(__dirname, "../../.env");
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/VITE_SUPABASE_URL\s*=\s*"?([^"\n]+)"?/);
    if (match) return match[1];
  } catch { /* ignore */ }
  return "http://127.0.0.1:54321";
}

export const SUPABASE_URL = readSupabaseUrl();
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const LS_KEY = `sb-${PROJECT_REF}-auth-token`;

export const MOCK_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "admin@flc.test",
  email_confirmed_at: "2024-01-01T00:00:00Z",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { name: "Test Admin" },
};

export const MOCK_PROFILE = {
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  name: "Test Admin",
  role: "super_admin",
  company_id: "00000000-0000-0000-0000-000000000099",
  branch_id: null,
  avatar_url: null,
  access_scope: "global",
};

/** Build a fake JWT with far-future expiry (no server verification in browser SDK). */
function fakeBearerToken(): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const payload = btoa(
    JSON.stringify({
      sub: MOCK_USER.id,
      aud: "authenticated",
      exp: 9999999999,
      iat: 1700000000,
      role: "authenticated",
      email: MOCK_USER.email,
    })
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.fakesignature`;
}

const ACCESS_TOKEN = fakeBearerToken();

const FAKE_SESSION = {
  access_token: ACCESS_TOKEN,
  token_type: "bearer",
  expires_in: 9999999,
  expires_at: 9999999999,
  refresh_token: "fake-refresh-token",
  user: MOCK_USER,
};

/**
 * Inject only a fake session into localStorage so the Supabase SDK will
 * attempt `updateUser` calls (which require an active session). Does NOT
 * set up full table mocks — callers can add their own route interceptors.
 */
export async function setupSessionForUpdateUser(page: Page) {
  await page.addInitScript(
    ({ key, value, userKey, userValue }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem(userKey, JSON.stringify(userValue));
    },
    {
      key: LS_KEY,
      value: FAKE_SESSION,
      userKey: LS_KEY + "-user",
      userValue: { user: MOCK_USER },
    }
  );

  // SDK validates the session via GET /auth/v1/user on some code paths
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_USER),
      });
    } else {
      route.continue();
    }
  });

  await page.route(`${SUPABASE_URL}/realtime/**`, (route) => route.abort());
}

export async function setupAuthMocks(page: Page) {
  // ------------------------------------------------------------------
  // 1. Inject localStorage BEFORE any navigation so the Supabase client
  //    finds an existing session on first load.
  //    Supabase SDK v2.103+ stores user separately under storageKey + '-user'
  // ------------------------------------------------------------------
  await page.addInitScript(
    ({ key, value, userKey, userValue }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem(userKey, JSON.stringify(userValue));
    },
    {
      key: LS_KEY,
      value: FAKE_SESSION,
      userKey: LS_KEY + "-user",
      userValue: { user: MOCK_USER },
    }
  );

  // ------------------------------------------------------------------
  // 2. Intercept network calls to Supabase and return mock responses.
  //    NOTE: Playwright matches routes LIFO (last registered = highest
  //    priority). Register the catch-all FIRST, specific routes LAST.
  // ------------------------------------------------------------------

  // Auth: POST /auth/v1/logout
  await page.route(`${SUPABASE_URL}/auth/v1/logout*`, (route) => {
    route.fulfill({ status: 204, body: "" });
  });

  // Auth: POST /auth/v1/token  (login + token-refresh)
  await page.route(`${SUPABASE_URL}/auth/v1/token*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_SESSION),
    });
  });

  // Auth: GET /auth/v1/user
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_USER),
    });
  });

  // Supabase realtime / websocket — abort silently
  await page.route(`${SUPABASE_URL}/realtime/**`, (route) => route.abort());

  // All other REST table queries → empty arrays (vehicles, imports, etc.)
  // Registered FIRST so it has LOWER priority than specific routes below
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (route) => {
    if (route.request().method() === "GET") {
      const accept = route.request().headers()["accept"] ?? "";
      const wantsSingle = accept.includes("pgrst.object");
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: wantsSingle ? "null" : "[]",
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  // Profiles table — registered LAST so it has HIGHEST priority (Playwright LIFO)
  // maybeSingle() sends Accept: application/vnd.pgrst.object+json → return single object
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    const wantsSingle = accept.includes("pgrst.object");
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: wantsSingle ? JSON.stringify(MOCK_PROFILE) : JSON.stringify([MOCK_PROFILE]),
    });
  });
}
