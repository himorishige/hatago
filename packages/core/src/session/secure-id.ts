/**
 * Secure session ID generation using Web Crypto API
 */

/**
 * Generate a cryptographically secure session ID
 * Uses 256-bit (32 bytes) random data for maximum security
 * @returns 64-character hex string session ID
 */
export function generateSessionId(): string {
  const bytes = new Uint8Array(32) // 256-bit
  crypto.getRandomValues(bytes)

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Validate session ID format
 * @param sessionId Session ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidSessionId(sessionId: string): boolean {
  // Must be 64-character hex string (256-bit)
  return /^[a-f0-9]{64}$/i.test(sessionId)
}

/**
 * Compare two session IDs in constant time to prevent timing attacks
 * @param a First session ID
 * @param b Second session ID
 * @returns true if IDs are equal, false otherwise
 */
export function secureCompareSessionId(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) {
    return false
  }

  // Convert to bytes for constant-time comparison
  const encoder = new TextEncoder()
  const bytesA = encoder.encode(a)
  const bytesB = encoder.encode(b)

  let result = 0
  for (let i = 0; i < bytesA.length; i++) {
    result |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0)
  }

  return result === 0
}
