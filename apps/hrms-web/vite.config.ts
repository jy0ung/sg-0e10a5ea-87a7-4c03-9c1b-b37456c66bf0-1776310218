import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

const rootDir = path.resolve(__dirname, '../..');

export default defineConfig({
  envDir: rootDir,
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
      '@hrms-web': path.resolve(__dirname, 'src'),
      '@flc/types': path.resolve(rootDir, 'packages/types/src/index.ts'),
      '@flc/supabase': path.resolve(rootDir, 'packages/supabase/src/index.ts'),
      '@flc/hrms-schemas': path.resolve(rootDir, 'packages/hrms-schemas/src/index.ts'),
      '@flc/hrms-services': path.resolve(rootDir, 'packages/hrms-services/src/index.ts'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  server: {
    host: '0.0.0.0',
    port: 3001,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
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
});