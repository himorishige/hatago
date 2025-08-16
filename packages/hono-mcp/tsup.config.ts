import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true, // Generate .d.ts files for type definitions
  clean: true,
  splitting: false,
  sourcemap: true,
  target: 'es2022',
  external: ['hono', '@modelcontextprotocol/sdk'],
})
