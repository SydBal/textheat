import { defineConfig } from 'tsup';

export default defineConfig([
  { entry: { index: 'src/api/index.ts', browser: 'src/browser/index.ts' }, format: ['esm', 'cjs'], dts: true, clean: false, sourcemap: true, target: 'es2022' },
  { entry: { cli: 'src/cli/index.ts' }, format: ['esm'], platform: 'node', target: 'node20' },
  { entry: { 'textheat.browser': 'src/browser/index.ts' }, format: ['esm'], platform: 'browser', target: 'es2022', sourcemap: true }
]);