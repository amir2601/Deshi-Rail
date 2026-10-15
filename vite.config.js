import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The engine renders to a fixed 320x180 canvas and pulls in no external assets,
// so a plain single-page React build is all we need.
export default defineConfig({
  plugins: [react()],
});
