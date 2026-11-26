import { defineConfig } from 'tsup';

// Bundles the server and the shared rules engine into one file.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  noExternal: ['@rcoi/shared'],
});
