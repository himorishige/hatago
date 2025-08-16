import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false, // Skip DTS for now due to type issues
  clean: true,
  splitting: false,
  sourcemap: true,
  target: 'es2022',
  external: ['hono', '@modelcontextprotocol/sdk'],
})
