import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

const rootDir = path.resolve(__dirname, '../..');
const buildSourceMaps = process.env.BUILD_SOURCEMAP === 'true';

export default defineConfig(({ mode }) => {
  const viteEnv = loadEnv(mode, rootDir, ['VITE_']);
  const shouldProxySupabase = Boolean(
    process.env.CODESPACES || viteEnv.VITE_SUPABASE_URL?.startsWith('/'),
  );

  return {
    base: process.env.VITE_BASE_PATH || '/',
    publicDir: path.resolve(rootDir, 'public'),
    define: {
      'import.meta.env.VITE_HRMS_WEB_APP': JSON.stringify('true'),
    },
    envDir: rootDir,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react()],
    resolve: {
      alias: {
        '@/components/ui': path.resolve(rootDir, 'packages/ui/src'),
        '@/hooks/use-toast': path.resolve(rootDir, 'packages/ui/src/hooks/use-toast.ts'),
        '@/hooks/use-mobile': path.resolve(rootDir, 'packages/ui/src/hooks/use-mobile.tsx'),
        '@': path.resolve(__dirname, 'src'),
        '@hrms-web': path.resolve(__dirname, 'src'),
        '@flc/auth': path.resolve(rootDir, 'packages/auth/src/index.ts'),
        '@flc/types': path.resolve(rootDir, 'packages/types/src/index.ts'),
        '@flc/supabase/client': path.resolve(rootDir, 'packages/supabase/src/client.ts'),
        '@flc/supabase/types': path.resolve(rootDir, 'packages/supabase/src/types.ts'),
        '@flc/supabase/useSupabaseChannel': path.resolve(rootDir, 'packages/supabase/src/useSupabaseChannel.ts'),
        '@flc/supabase': path.resolve(rootDir, 'packages/supabase/src/index.ts'),
        '@flc/shell': path.resolve(rootDir, 'packages/shell/src/index.ts'),
        '@flc/hrms-schemas': path.resolve(rootDir, 'packages/hrms-schemas/src/index.ts'),
        '@flc/hrms-services': path.resolve(rootDir, 'packages/hrms-services/src/index.ts'),
        '@flc/ui': path.resolve(rootDir, 'packages/ui/src'),
      },
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    server: {
      host: '0.0.0.0',
      port: 3001,
      proxy: shouldProxySupabase
        ? {
            '/__supabase': {
              target: 'http://127.0.0.1:54321',
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/__supabase/, ''),
            },
          }
        : undefined,
    },
    build: {
      outDir: 'dist',
      sourcemap: buildSourceMaps,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['lucide-react', 'next-themes', 'sonner'],
            'vendor-data': ['@tanstack/react-query', '@supabase/supabase-js'],
            'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod', 'date-fns'],
          },
        },
      },
    },
  };
});
