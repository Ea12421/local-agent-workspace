import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The bundled Vite/Rolldown runtime currently fails inside the React
  // refresh wrapper (`Missing field moduleType`). HMR is not part of the
  // product runtime, so disable it to keep the local preview deterministic.
  server: { port: 5173, strictPort: false, hmr: false },
})
