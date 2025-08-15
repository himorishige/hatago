import helloHatago from './hello-hatago.js'
import oauthMetadata from './oauth-metadata.js'

// Environment variables with defaults
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true'
const AUTH_ISSUER = process.env.AUTH_ISSUER || 'https://accounts.example.com'
const RESOURCE = process.env.RESOURCE // Let the plugin derive from request if not set

export const defaultPlugins = [
  // stream "Hello Hatago"
  helloHatago(),
  // publish OAuth PRM; auth not enforced by default
  oauthMetadata({
    issuer: AUTH_ISSUER,
    resource: RESOURCE,
    requireAuth: REQUIRE_AUTH,
  }),
]
