import { afterAll, afterEach, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'error'
})

afterEach(() => {
  // Clean up
})

afterAll(() => {
  // Global cleanup
})
