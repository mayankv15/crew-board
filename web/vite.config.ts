import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:3000', rewrite: (path) => path.replace(/^\/api/, '') },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-redux|@reduxjs|redux|reselect|immer)[\\/]/,
            },
            { name: 'vendor-grid', test: /node_modules[\\/]@mui[\\/]x-/ },
            { name: 'vendor-mui', test: /node_modules[\\/](@mui|@emotion|clsx|prop-types|react-is|stylis)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});
