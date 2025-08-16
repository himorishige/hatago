import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  minify: false,
  // Make CLI executable
  onSuccess: async () => {
    const { readFileSync, writeFileSync, chmodSync } = await import('node:fs')
    try {
      // Add shebang to the built file
      const distPath = 'dist/index.js'
      const content = readFileSync(distPath, 'utf-8')

      // Check if shebang already exists
      if (!content.startsWith('#!/usr/bin/env node')) {
        const contentWithShebang = `#!/usr/bin/env node\n${content}`
        writeFileSync(distPath, contentWithShebang)
      }

      // Make executable
      chmodSync(distPath, 0o755)
    } catch (err) {
      console.warn('Failed to add shebang or make executable:', err)
    }
  },
})
