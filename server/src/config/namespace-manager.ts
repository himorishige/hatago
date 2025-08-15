/**
 * Namespace manager for MCP tool names
 */

import type { MCPServerConfig, ProxyConfig } from './types.js'

export interface ToolConflict {
  toolName: string
  existing: { server: string; tool: any }
  attempted: { server: string; tool: any }
  suggestion?: string
}

export interface NamespaceStats {
  totalTools: number
  totalConflicts: number
  serverCounts: Record<string, number>
}

export class NamespaceManager {
  private registeredTools = new Map<string, { server: string; tool: any }>()
  private conflicts: ToolConflict[] = []
  private config: ProxyConfig

  constructor(config: ProxyConfig) {
    this.config = config
  }

  /**
   * Register a tool with namespace management
   * @param serverConfig - Server configuration
   * @param tool - Tool definition
   * @returns Final tool name to use
   */
  registerTool(serverConfig: MCPServerConfig, tool: any): string {
    const originalName = tool.name

    // Check if tool should be excluded
    if (this.isToolExcluded(serverConfig, originalName)) {
      throw new Error(`Tool ${originalName} is excluded`)
    }

    // Generate namespace-aware name
    let finalName = this.generateToolName(serverConfig, originalName)

    // Handle conflicts
    if (this.registeredTools.has(finalName)) {
      const existing = this.registeredTools.get(finalName)!
      const conflict: ToolConflict = {
        toolName: originalName,
        existing,
        attempted: { server: serverConfig.id, tool }
      }

      switch (this.config.conflictResolution) {
        case 'error':
          this.conflicts.push(conflict)
          throw new Error(`Tool name conflict: ${finalName} already exists from ${existing.server}`)
        
        case 'skip':
          this.conflicts.push(conflict)
          throw new Error(`Tool ${finalName} skipped due to conflict`)
        
        case 'rename':
          finalName = this.resolveConflict(serverConfig, originalName, finalName)
          conflict.suggestion = finalName
          this.conflicts.push(conflict)
          break
      }
    }

    // Register the tool
    this.registeredTools.set(finalName, { 
      server: serverConfig.id, 
      tool: { ...tool, name: finalName } 
    })

    return finalName
  }

  /**
   * Generate tool name with namespace strategy
   */
  private generateToolName(serverConfig: MCPServerConfig, toolName: string): string {
    const namespace = this.config.namespace || {}
    const separator = namespace.separator || '_'
    
    // Sanitize names (replace dots with separators for Claude Desktop compatibility)
    const cleanToolName = toolName.replace(/\./g, separator)
    
    switch (this.config.namespaceStrategy) {
      case 'prefix':
        return `${serverConfig.id}${separator}${cleanToolName}`
      
      case 'suffix':
        return `${cleanToolName}${separator}${serverConfig.id}`
      
      case 'none':
      default:
        return cleanToolName
    }
  }

  /**
   * Resolve naming conflict by generating alternative name
   */
  private resolveConflict(serverConfig: MCPServerConfig, originalName: string, conflictName: string): string {
    const namespace = this.config.namespace || {}
    const separator = namespace.separator || '_'
    
    for (let i = 2; i <= 10; i++) {
      const alternative = `${conflictName}${separator}${i}`
      if (!this.registeredTools.has(alternative)) {
        return alternative
      }
    }

    // Fallback to timestamp-based name
    const timestamp = Date.now().toString(36)
    return `${conflictName}${separator}${timestamp}`
  }

  /**
   * Check if tool should be excluded
   */
  private isToolExcluded(serverConfig: MCPServerConfig, toolName: string): boolean {
    if (serverConfig.includedTools && !serverConfig.includedTools.includes(toolName)) {
      return true
    }
    
    if (serverConfig.excludedTools && serverConfig.excludedTools.includes(toolName)) {
      return true
    }
    
    return false
  }

  /**
   * Get all registered conflicts
   */
  getConflicts(): ToolConflict[] {
    return [...this.conflicts]
  }

  /**
   * Get namespace statistics
   */
  getStatistics(): NamespaceStats {
    const serverCounts: Record<string, number> = {}
    
    for (const { server } of this.registeredTools.values()) {
      serverCounts[server] = (serverCounts[server] || 0) + 1
    }

    return {
      totalTools: this.registeredTools.size,
      totalConflicts: this.conflicts.length,
      serverCounts
    }
  }

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.registeredTools.clear()
    this.conflicts.length = 0
  }
}