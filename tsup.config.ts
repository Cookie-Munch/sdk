import { defineConfig } from 'tsup';
export default defineConfig({
  // `consent` is its own entry so `@cookiemunch/sdk/consent` (the server-side cookie reader)
  // loads without the API client; `rights` (the cm-standard-v2 executor handlers) likewise.
  entry: { index: 'src/index.ts', consent: 'src/consent.ts', rights: 'src/rights.ts' },
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
});
