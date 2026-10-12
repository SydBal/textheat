import { rmSync } from 'node:fs';
// Clean once before concurrent bundlers start, never during their writes.
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });