import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The SPA is a build ARTIFACT committed at static/app/ and served by BOTH nginx
// modes via the existing ./static bind mount — the TLS testbed topology is
// untouched. gate_ui_build verifies the committed dist matches frontend/ source.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: { outDir: '../static/app', emptyOutDir: true },
});
