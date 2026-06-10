import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'html-build-timestamp',
      transformIndexHtml(html) {
        const date = new Date();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const timestamp = `${mm}-${dd} ${hh}:${min}`;
        return html.replace(/<title>(.*?)<\/title>/, `<title>$1 (${timestamp})</title>`);
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:3000',
      '/auth-config': 'http://127.0.0.1:3000',
      '/battles': 'http://127.0.0.1:3000',
      '/rooms': 'http://127.0.0.1:3000',
      '/admin': 'http://127.0.0.1:3000',
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
    },
  },
  optimizeDeps: {
    // 强制 Vite 预打包 protobufjs，防止其内部 require('fs') 在 dev 模式下泄露到浏览器控制台
    include: ['protobufjs'],
  },
});
