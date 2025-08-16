import { afterAll, afterEach, beforeAll } from 'vitest'

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'error' // Suppress logs during tests
})

afterEach(() => {
  // Clean up after each test
})

afterAll(() => {
  // Global cleanup
})
