import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tailwind v4 writes every color as oklch(), which Chrome < 111 and
// Firefox < 113 cannot read — backgrounds vanish and white-on-indigo buttons
// like "Edit Load" turn invisible. Lowering the CSS for older browsers makes
// lightningcss emit an rgb() fallback beside each oklch() color.
const legacyCssTargets = {
  chrome: 90 << 16,
  firefox: 90 << 16,
  safari: (14 << 16) | (1 << 8),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    lightningcss: { targets: legacyCssTargets },
  },
  build: {
    cssMinify: 'lightningcss',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
