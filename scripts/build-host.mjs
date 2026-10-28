#!/usr/bin/env node
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('lib', { recursive: true })
await build({
  entryPoints: ['src/index.ts', 'src/core/craft.ts'],
  outdir: 'lib',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  external: ['@deepseek-ai/*'],
  logLevel: 'info',
})
