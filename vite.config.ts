import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// host: true exposes the LAN IP so a Quest 3 can reach the machine.
// Quest Browser requires HTTPS for WebXR on non-localhost — use
// `npm run preview` behind a tunnel, or `vite --host` with a local cert.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    // three.js is already isolated in its own chunk below and cannot be split
    // further — raise the warning ceiling above its ~700 kB minified size.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three'
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'react'
          }
        },
      },
    },
  },
})
