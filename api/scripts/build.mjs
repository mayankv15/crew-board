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
