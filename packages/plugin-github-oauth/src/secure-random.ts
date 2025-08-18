/**
 * Secure random ID generation using Web Crypto API
 */

/**
 * Convert Uint8Array to hex string
 * @param bytes Uint8Array
 * @returns hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert Uint8Array to base64url string
 * @param bytes Uint8Array
 * @returns base64url string
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Generate a cryptographically secure random ID
 * @returns 128-bit random ID as hex string
 */
export function generateSecureId(): string {
  const bytes = new Uint8Array(16) // 128-bit
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/**
 * Compare two strings in constant time to prevent timing attacks
 * @param a First string
 * @param b Second string
 * @returns true if strings are equal, false otherwise
 */
export function secureCompare(a: string, b: string): boolean {
  if (!a || !b) return false

  // Convert strings to Uint8Array for comparison
  const encoder = new TextEncoder()
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)

  // Length must match for timing-safe comparison
  if (bufA.length !== bufB.length) return false

  // Constant-time comparison
  let result = 0
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i]
  }

  return result === 0
}

/**
 * Generate a secure random token for OAuth state parameter
 * @returns 256-bit random token as base64url string
 */
export function generateStateToken(): string {
  const bytes = new Uint8Array(32) // 256-bit
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

/**
 * Generate a PKCE verifier
 * @returns 256-bit random verifier as base64url string
 */
export function generatePKCEVerifier(): string {
  const bytes = new Uint8Array(32) // 256-bit
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}
