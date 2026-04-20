import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@flc/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@flc/supabase': path.resolve(__dirname, '../../packages/supabase/src/index.ts'),
      '@flc/hrms-schemas': path.resolve(__dirname, '../../packages/hrms-schemas/src/index.ts'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
});
