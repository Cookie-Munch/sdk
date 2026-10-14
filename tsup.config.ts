import { defineConfig } from 'tsup';
export default defineConfig({
  // `consent` is its own entry so `@cookiemunch/sdk/consent` (the server-side cookie reader)
  // loads without the API client.
  entry: { index: 'src/index.ts', consent: 'src/consent.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
