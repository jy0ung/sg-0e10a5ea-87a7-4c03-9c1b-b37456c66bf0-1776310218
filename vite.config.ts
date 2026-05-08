import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const buildSourceMaps = process.env.BUILD_SOURCEMAP === "true";

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
      "@": path.resolve(__dirname, "./src"),
      "@flc/types": path.resolve(__dirname, "./packages/types/src/index.ts"),
      "@flc/supabase": path.resolve(__dirname, "./packages/supabase/src/index.ts"),
      "@flc/hrms-schemas": path.resolve(__dirname, "./packages/hrms-schemas/src/index.ts"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    sourcemap: buildSourceMaps,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — loaded on every page
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // All Radix UI primitives + icon/animation libs
          "vendor-ui": [
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
            "@radix-ui/react-tooltip",
            "lucide-react", "sonner", "vaul", "cmdk",
            "input-otp", "embla-carousel-react", "react-day-picker",
            "react-resizable-panels", "next-themes",
          ],
          // Data-fetching and backend client
          "vendor-data": ["@tanstack/react-query", "@supabase/supabase-js"],
          // Charting library — large, only used on dashboard pages
          "vendor-charts": ["recharts"],
          // Excel import/export — large, only used on import/report pages
          "vendor-excel": ["exceljs"],
          // Form utilities
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod", "date-fns",
                           "tailwind-merge", "clsx", "class-variance-authority"],
        },
      },
    },
  },
  };
});
