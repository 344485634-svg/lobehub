import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'raw-md',
      transform(_, id) {
        if (id.endsWith('.md')) return { code: 'export default ""', map: null };
      },
    },
  ],
  test: {
    alias: {
      '@/business/server': resolve(__dirname, './src'),
      '@/types': resolve(__dirname, '../types/src'),
      '@/database': resolve(__dirname, './node_modules/@lobechat/database/src'),
      '@/libs/model-runtime': resolve(__dirname, '../model-runtime/src'),
    },
    environment: 'node',
  },
});
