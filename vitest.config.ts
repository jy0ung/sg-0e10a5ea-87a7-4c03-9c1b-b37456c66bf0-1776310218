import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "apps/hrms-web/src/**/*.{test,spec}.{ts,tsx}",
      "packages/*/src/**/*.{test,spec}.{ts,tsx}",
    ],
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
      include: [
        "src/**/*.{ts,tsx}",
        "packages/internal-requests/src/**/*.ts",
      ],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/components/ui/**",
        "packages/internal-requests/src/**/*.test.ts",
        "packages/internal-requests/src/test/**",
        "packages/internal-requests/src/index.ts",
      ],
      // Baseline thresholds — ratchet upward as coverage grows. Target per
      // plan is ≥70% on services/, contexts/, lib/. These floors protect
      // against regressions while new tests land.
      thresholds: {
        "src/lib/**": { lines: 50, functions: 60, branches: 75, statements: 50 },
        "src/contexts/**": { lines: 60, functions: 65, branches: 50, statements: 60 },
        "src/utils/**": { lines: 50, functions: 60, branches: 90, statements: 50 },
        "src/services/**": { lines: 60, functions: 65, branches: 50, statements: 60 },
        // Internal Request module: the consolidated config services carry the
        // production-hardening logic (CRUD, optimistic locking, audit) and are
        // held to >80% line/function coverage. Listed per-file so the (separately
        // owned, separately tested) approval service/resolver aren't gated here.
        "packages/internal-requests/src/requestCategoryService.ts": { lines: 80, functions: 80, branches: 60, statements: 75 },
        "packages/internal-requests/src/requestSubcategoryService.ts": { lines: 80, functions: 80, branches: 55, statements: 75 },
        "packages/internal-requests/src/requestFormFieldService.ts": { lines: 80, functions: 80, branches: 55, statements: 70 },
        "packages/internal-requests/src/requestTemplateService.ts": { lines: 80, functions: 80, branches: 55, statements: 75 },
        "packages/internal-requests/src/requestRoutingService.ts": { lines: 80, functions: 80, branches: 60, statements: 70 },
        "packages/internal-requests/src/mutationSupport.ts": { lines: 80, functions: 80, branches: 60, statements: 80 },
      },
    },
  },
  resolve: {
    alias: {
      "@/components/ui": path.resolve(__dirname, "./packages/ui/src"),
      "@/hooks/use-toast": path.resolve(__dirname, "./packages/ui/src/hooks/use-toast.ts"),
      "@/hooks/use-mobile": path.resolve(__dirname, "./packages/ui/src/hooks/use-mobile.tsx"),
      "@": path.resolve(__dirname, "./src"),
      "@flc/types": path.resolve(__dirname, "./packages/types/src/index.ts"),
      "@flc/supabase/client": path.resolve(__dirname, "./packages/supabase/src/client.ts"),
      "@flc/supabase/types": path.resolve(__dirname, "./packages/supabase/src/types.ts"),
      "@flc/supabase/useSupabaseChannel": path.resolve(__dirname, "./packages/supabase/src/useSupabaseChannel.ts"),
      "@flc/supabase": path.resolve(__dirname, "./packages/supabase/src/index.ts"),
      "@flc/shell": path.resolve(__dirname, "./packages/shell/src/index.ts"),
      "@flc/hrms-schemas": path.resolve(__dirname, "./packages/hrms-schemas/src/index.ts"),
      "@flc/internal-requests": path.resolve(__dirname, "./packages/internal-requests/src/index.ts"),
      "@flc/platform-services": path.resolve(__dirname, "./packages/platform-services/src/index.ts"),
      "@flc/ui": path.resolve(__dirname, "./packages/ui/src"),
    },
  },
});
