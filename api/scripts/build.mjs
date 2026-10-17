// Bundles the API, the sync CLI and the webhook test script, with the shared package inlined.
// better-sqlite3 is native and swagger-ui is dev-only, so both stay external.
import { build } from 'esbuild';

await build({
  entryPoints: { server: 'src/server.ts', sync: 'src/cli/sync.ts', 'webhook-test': 'src/cli/webhook-test.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external: ['better-sqlite3', '@fastify/swagger-ui'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
