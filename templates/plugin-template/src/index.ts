import type { CapabilityAwarePluginFactory, PluginContext } from '@hatago/core'

export interface {{PLUGIN_NAME_PASCAL}}Config {
  /** Enable/disable the plugin */
  enabled?: boolean
  /** Custom configuration options */
  customOption?: string
}

/**
 * {{DESCRIPTION}}
 * 
 * This plugin demonstrates the basic structure of a Hatago plugin using
 * the capability-based architecture.
 */
const {{PLUGIN_NAME_CAMEL}}Plugin: CapabilityAwarePluginFactory = (context: PluginContext) => {
  const _config: {{PLUGIN_NAME_PASCAL}}Config = {
    enabled: true,
    ...context.config as {{PLUGIN_NAME_PASCAL}}Config
  }
  
  return async ({ server, capabilities }) => {
    if (!config.enabled) {
      return
    }

    const { logger } = capabilities
    
    // Register example tool
    server.registerTool(
      '{{PLUGIN_NAME}}.example',
      {
        title: 'Example Tool',
        description: 'Example tool provided by {{PLUGIN_NAME}} plugin',
        inputSchema: {}
      },
      async (args: any) => {
        const { message = 'Hello from {{PLUGIN_NAME}}!' } = args
        
        logger.info('Example tool called', { 
          pluginName: context.manifest.name,
          message,
          runtime: context.runtime
        })
        
        return {
          content: [
            {
              type: 'text',
              text: `${message} (from ${context.manifest.name})`
            }
          ]
        }
      }
    )
    
    // Add more tools here...
    
    logger.info('{{PLUGIN_NAME_PASCAL}} plugin initialized', {
      pluginName: context.manifest.name,
      version: context.manifest.version,
      runtime: context.runtime,
      config
    })
  }
}

export default {{PLUGIN_NAME_CAMEL}}Plugin