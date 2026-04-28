import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/test/rls-matrix.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@flc/types': path.resolve(__dirname, './packages/types/src/index.ts'),
      '@flc/supabase': path.resolve(__dirname, './packages/supabase/src/index.ts'),
      '@flc/hrms-schemas': path.resolve(__dirname, './packages/hrms-schemas/src/index.ts'),
    },
  },
});
