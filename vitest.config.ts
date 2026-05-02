import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "apps/hrms-web/src/**/*.{test,spec}.{ts,tsx}"],
    // RLS matrix requires a live Supabase stack + seeded users. Run via
    // `npm run test:rls`, which uses vitest.rls.config.ts.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "src/test/rls-matrix.spec.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/i18n/**",
        "src/components/ui/**",
      ],
      // Baseline thresholds — ratchet upward as coverage grows. Target per
      // plan is ≥70% on services/, contexts/, lib/. These floors protect
      // against regressions while new tests land.
      thresholds: {
        "src/lib/**": { lines: 50, functions: 60, branches: 75, statements: 50 },
        "src/contexts/**": { lines: 60, functions: 65, branches: 50, statements: 60 },
        "src/utils/**": { lines: 50, functions: 60, branches: 90, statements: 50 },
        "src/services/**": { lines: 60, functions: 65, branches: 50, statements: 60 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@flc/types": path.resolve(__dirname, "./packages/types/src/index.ts"),
      "@flc/supabase": path.resolve(__dirname, "./packages/supabase/src/index.ts"),
      "@flc/hrms-schemas": path.resolve(__dirname, "./packages/hrms-schemas/src/index.ts"),
    },
  },
});
