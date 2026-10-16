import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The engine renders to a fixed 320x180 canvas. The only extra asset is the
// bundled Bengali pixel font in public/fonts (no network needed), so a plain
// single-page React build is all we need.
export default defineConfig({
  plugins: [react()],
});
