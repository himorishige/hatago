/**
 * Test Plugin for Hatago Shared GitHub App
 * Demonstrates zero-configuration usage with device flow
 */
import type { HatagoPlugin } from '@hatago/core'
import { createDefaultLogger } from '@hatago/core'
import { getGitHubConfig, getSetupInstructions, isUsingSharedApp } from './config.js'
import { createGitHubDeviceFlowPlugin } from './plugin.js'

const logger = createDefaultLogger('github-shared-app-test')

/**
 * Test plugin that demonstrates shared GitHub App usage
 * No configuration required - automatically uses Hatago shared app
 */
export const testSharedAppPlugin: HatagoPlugin = async ctx => {
  const { server, env = {} } = ctx

  // Show current configuration
  const config = getGitHubConfig(env)
  const usingShared = isUsingSharedApp(config)
  const instructions = getSetupInstructions(config)

  logger.info('GitHub App Configuration Test', {
    clientId: `${config.clientId.substring(0, 8)}...`,
    usingSharedApp: usingShared,
    hasSecret: !!config.clientSecret,
    scope: config.scope,
  })

  logger.info('Setup Instructions', { instructions })

  // Create and apply the device flow plugin
  const deviceFlowPlugin = createGitHubDeviceFlowPlugin()
  await deviceFlowPlugin(ctx)

  // Add a test tool to verify everything is working
  server.registerTool(
    'github_test_shared_app',
    {
      title: 'Test Shared GitHub App Configuration',
      description: 'Verify that the shared GitHub App is configured correctly',
      inputSchema: {},
    },
    async () => {
      const testResults = {
        sharedAppStatus: {
          usingSharedApp: usingShared,
          clientId: usingShared ? 'Hatago-Shared-App' : 'Custom-App',
          configuredCorrectly: !!config.clientId,
        },
        availableTools: [
          'github_auth_start',
          'github_auth_status',
          'github_logout',
          'github_user_authenticated',
          'github_repos_authenticated',
        ],
        instructions: instructions,
        nextSteps: usingShared
          ? [
              '1. Run github_auth_start to begin authentication',
              '2. Visit the verification URL and enter the code',
              '3. Run github_auth_status to check authentication progress',
              '4. Use github_user_authenticated or github_repos_authenticated once authenticated',
            ]
          : [
              '1. Set GITHUB_CLIENT_ID environment variable',
              '2. Optionally set GITHUB_CLIENT_SECRET for token revocation',
              '3. Restart the server and run this test again',
            ],
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(testResults, null, 2),
          },
        ],
      }
    }
  )

  // Log successful initialization
  logger.info('Shared GitHub App test plugin initialized', {
    testTool: 'github_test_shared_app',
    deviceFlowReady: true,
  })
}

export default testSharedAppPlugin
