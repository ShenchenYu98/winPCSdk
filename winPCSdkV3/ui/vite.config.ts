import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, './index.html'),
        imChat: path.resolve(__dirname, './im-chat.html'),
      },
    },
    outDir: path.resolve(__dirname, '../ui-dist'),
    emptyOutDir: true,
  },
});
