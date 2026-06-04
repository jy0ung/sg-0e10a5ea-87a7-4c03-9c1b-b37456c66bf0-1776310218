import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const buildSourceMaps = process.env.BUILD_SOURCEMAP === "true";

const vendorChunkGroups = [
  { name: "vendor-react", packages: ["react", "react-dom", "react-router-dom"] },
  {
    name: "vendor-ui",
    packages: [
      "@radix-ui/react-accordion", "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio", "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox", "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu", "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu", "@radix-ui/react-hover-card",
      "@radix-ui/react-label", "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu", "@radix-ui/react-popover",
      "@radix-ui/react-progress", "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area", "@radix-ui/react-select",
      "@radix-ui/react-separator", "@radix-ui/react-slider",
      "@radix-ui/react-slot", "@radix-ui/react-switch",
      "@radix-ui/react-tabs", "@radix-ui/react-toast",
      "@radix-ui/react-toggle", "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip", "lucide-react", "sonner", "vaul",
      "cmdk", "input-otp", "embla-carousel-react", "react-day-picker",
      "react-resizable-panels", "next-themes",
    ],
  },
  { name: "vendor-data", packages: ["@tanstack/react-query", "@supabase/supabase-js"] },
  { name: "vendor-charts", packages: ["recharts"] },
  { name: "vendor-excel", packages: ["exceljs"] },
  {
    name: "vendor-forms",
    packages: [
      "react-hook-form", "@hookform/resolvers", "zod", "date-fns",
      "tailwind-merge", "clsx", "class-variance-authority",
    ],
  },
] as const;

function matchesPackage(id: string, packageName: string) {
  return id.includes(`/node_modules/${packageName}/`) || id.includes(`\\node_modules\\${packageName}\\`);
}

function resolveManualChunk(id: string) {
  if (id.includes("/src/lib/import-parser.ts")) return "feature-auto-aging-import";
  if (id.includes("/src/lib/googleSheetsImport.ts")) return "feature-google-sheets-import";
  if (id.includes("/src/services/reportService.ts")) return "feature-auto-aging-reporting";
  if (id.includes("/src/services/businessReportService.ts")) return "feature-business-reports";
  if (id.includes("/src/components/KpiDashboard.tsx")) return "feature-executive-kpis";

  for (const group of vendorChunkGroups) {
    if (group.packages.some((packageName) => matchesPackage(id, packageName))) {
      return group.name;
    }
  }

  return undefined;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const viteEnv = loadEnv(mode, process.cwd(), ["VITE_"]);
  const shouldProxySupabase = Boolean(
    process.env.CODESPACES || viteEnv.VITE_SUPABASE_URL?.startsWith('/'),
  );

  return {
  server: {
    host: "::",
    port: 3000,
    hmr: {
      overlay: false,
    },
    proxy: shouldProxySupabase
      ? {
          '/__supabase': {
            target: 'http://127.0.0.1:54321',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/__supabase/, ''),
          },
        }
      : undefined,
  },
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "offline.html", "icons/logo.png", "icons/Fook Loi Corp (Sabah) Sdn. Bhd. Logo.png", "icons/Fook Loi Logo_with white bg.png"],
      manifest: {
        name: "FLC BI App",
        short_name: "FLC",
        description: "FLC Business Intelligence & HRMS",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icons/logo.png", sizes: "3000x3000", type: "image/png" },
          { src: "/icons/logo.png", sizes: "3000x3000", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Navigations must boot the SPA so client-side redirects (such as the
        // main-app HRMS launcher) can run. Using offline.html here causes any
        // same-origin routed navigation under SW control to render the offline
        // shell instead of index.html.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/supabase\//,
          /^\/(auth|rest|graphql|functions|storage)\/v1(?:\/|$)/,
          /^\/realtime\/v1(?:\/|$)/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-cache",
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      // More-specific aliases must come first. Vite resolves in declared order,
      // and `@/components/ui/*` and `@/hooks/use-toast`/`use-mobile` are now
      // owned by the `@flc/ui` package.
      "@/components/ui": path.resolve(__dirname, "./packages/ui/src"),
      "@/hooks/use-toast": path.resolve(__dirname, "./packages/ui/src/hooks/use-toast.ts"),
      "@/hooks/use-mobile": path.resolve(__dirname, "./packages/ui/src/hooks/use-mobile.tsx"),
      "@": path.resolve(__dirname, "./src"),
      "@flc/auth": path.resolve(__dirname, "./packages/auth/src/index.ts"),
      "@flc/types": path.resolve(__dirname, "./packages/types/src/index.ts"),
      "@flc/supabase/client": path.resolve(__dirname, "./packages/supabase/src/client.ts"),
      "@flc/supabase/types": path.resolve(__dirname, "./packages/supabase/src/types.ts"),
      "@flc/supabase/useSupabaseChannel": path.resolve(__dirname, "./packages/supabase/src/useSupabaseChannel.ts"),
      "@flc/supabase": path.resolve(__dirname, "./packages/supabase/src/index.ts"),
      "@flc/shell": path.resolve(__dirname, "./packages/shell/src/index.ts"),
      "@flc/hrms-schemas": path.resolve(__dirname, "./packages/hrms-schemas/src/index.ts"),
      "@flc/hrms-services/access": path.resolve(__dirname, "./packages/hrms-services/src/access/access.ts"),
      "@flc/hrms-services": path.resolve(__dirname, "./packages/hrms-services/src/index.ts"),
      "@flc/internal-requests": path.resolve(__dirname, "./packages/internal-requests/src/index.ts"),
      "@flc/platform-services": path.resolve(__dirname, "./packages/platform-services/src/index.ts"),
      "@flc/ui": path.resolve(__dirname, "./packages/ui/src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    sourcemap: buildSourceMaps,
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
  };
});
