import type {
  MCPServerConfig,
  ToolMappingInfo,
  NamespaceConflict,
  NamespaceConfig,
  ProxyConfig,
} from './types.js'

interface RemoteTool {
  name: string
  title?: string
  description?: string
  inputSchema?: any
}

/**
 * Namespace manager for handling tool name conflicts and mapping
 */
export class NamespaceManager {
  private mappings = new Map<string, ToolMappingInfo>()
  private conflicts: NamespaceConflict[] = []
  private config: NamespaceConfig
  private conflictResolution: 'error' | 'rename' | 'skip'
  private namespaceStrategy: 'prefix' | 'suffix' | 'custom'

  constructor(proxyConfig: ProxyConfig) {
    this.config = proxyConfig.namespace || {
      separator: ':',
      caseSensitive: false,
      maxLength: 64,
    }
    this.conflictResolution = proxyConfig.conflictResolution || 'error'
    this.namespaceStrategy = proxyConfig.namespaceStrategy || 'prefix'
  }

  /**
   * Register a tool from a remote server
   * @param serverConfig - Server configuration
   * @param tool - Remote tool information
   * @returns Final mapped tool name
   */
  registerTool(serverConfig: MCPServerConfig, tool: RemoteTool): string {
    // Apply tool filtering first
    if (!this.shouldIncludeTool(serverConfig, tool)) {
      throw new Error(`Tool ${tool.name} excluded by configuration`)
    }

    // Get the base tool name (after renaming if configured)
    const baseName = this.getBaseName(serverConfig, tool)

    // Apply namespace strategy
    const namespacedName = this.applyNamespaceStrategy(serverConfig, baseName)

    // Validate tool name
    this.validateToolName(namespacedName)

    // Check for conflicts
    const finalName = this.resolveConflicts(namespacedName, serverConfig, tool)

    // Register the mapping
    const mapping: ToolMappingInfo = {
      original: tool.name,
      mapped: finalName,
      namespace: serverConfig.namespace || serverConfig.id,
      server: serverConfig.id,
      metadata: {
        title: tool.title,
        description: tool.description,
        category: this.inferCategory(tool),
      },
    }

    this.mappings.set(finalName, mapping)

    console.log(`Namespace: Registered ${tool.name} -> ${finalName} (${serverConfig.id})`)
    return finalName
  }

  /**
   * Get all registered mappings
   */
  getMappings(): Map<string, ToolMappingInfo> {
    return new Map(this.mappings)
  }

  /**
   * Get mapping for a specific tool
   */
  getMapping(toolName: string): ToolMappingInfo | undefined {
    return this.mappings.get(toolName)
  }

  /**
   * Get all conflicts detected
   */
  getConflicts(): NamespaceConflict[] {
    return [...this.conflicts]
  }

  /**
   * Clear all mappings (for testing)
   */
  clear(): void {
    this.mappings.clear()
    this.conflicts = []
  }

  /**
   * Check if tool should be included based on configuration
   */
  private shouldIncludeTool(serverConfig: MCPServerConfig, tool: RemoteTool): boolean {
    const toolConfig = serverConfig.tools
    if (!toolConfig) return true

    // Check exclude list
    if (toolConfig.exclude && this.matchesPattern(tool.name, toolConfig.exclude)) {
      return false
    }

    // Check include list
    if (toolConfig.include && toolConfig.include.length > 0) {
      return this.matchesPattern(tool.name, toolConfig.include)
    }

    return true
  }

  /**
   * Get base name for tool (apply renaming if configured)
   */
  private getBaseName(serverConfig: MCPServerConfig, tool: RemoteTool): string {
    const rename = serverConfig.tools?.rename
    if (rename && rename[tool.name]) {
      return rename[tool.name]
    }
    return tool.name
  }

  /**
   * Apply namespace strategy to tool name
   */
  private applyNamespaceStrategy(serverConfig: MCPServerConfig, baseName: string): string {
    const namespace = serverConfig.namespace || serverConfig.id
    const separator = this.config.separator || ':'

    switch (this.namespaceStrategy) {
      case 'prefix':
        return `${namespace}${separator}${baseName}`
      case 'suffix':
        return `${baseName}${separator}${namespace}`
      case 'custom':
        // Custom strategy could be implemented here
        return `${namespace}${separator}${baseName}`
      default:
        return `${namespace}${separator}${baseName}`
    }
  }

  /**
   * Validate tool name according to configuration
   */
  private validateToolName(toolName: string): void {
    if (this.config.maxLength && toolName.length > this.config.maxLength) {
      throw new Error(`Tool name too long: ${toolName} (max: ${this.config.maxLength})`)
    }

    // Additional validation rules can be added here
    if (!/^[a-zA-Z0-9_:.\\-]+$/.test(toolName)) {
      throw new Error(`Invalid characters in tool name: ${toolName}`)
    }
  }

  /**
   * Resolve naming conflicts
   */
  private resolveConflicts(
    proposedName: string,
    serverConfig: MCPServerConfig,
    tool: RemoteTool
  ): string {
    const normalizedName = this.config.caseSensitive ? proposedName : proposedName.toLowerCase()
    const existingMapping = this.findConflictingMapping(normalizedName)

    if (!existingMapping) {
      return proposedName
    }

    // Record the conflict
    const conflict: NamespaceConflict = {
      toolName: proposedName,
      existing: existingMapping,
      attempted: {
        original: tool.name,
        mapped: proposedName,
        namespace: serverConfig.namespace || serverConfig.id,
        server: serverConfig.id,
      },
    }

    switch (this.conflictResolution) {
      case 'error':
        this.conflicts.push(conflict)
        throw new Error(
          `Tool name conflict: ${proposedName} already exists from ${existingMapping.server}`
        )

      case 'skip':
        console.warn(
          `Skipping conflicting tool: ${proposedName} (conflicts with ${existingMapping.server})`
        )
        throw new Error(`Tool skipped due to conflict: ${proposedName}`)

      case 'rename':
        const resolvedName = this.generateAlternativeName(proposedName, serverConfig)
        conflict.suggestion = resolvedName
        this.conflicts.push(conflict)
        console.warn(`Renamed conflicting tool: ${proposedName} -> ${resolvedName}`)
        return resolvedName

      default:
        throw new Error(`Unknown conflict resolution strategy: ${this.conflictResolution}`)
    }
  }

  /**
   * Find conflicting mapping (case-sensitive or insensitive)
   */
  private findConflictingMapping(toolName: string): ToolMappingInfo | undefined {
    if (this.config.caseSensitive) {
      return this.mappings.get(toolName)
    }

    // Case-insensitive search
    for (const [key, mapping] of this.mappings) {
      if (key.toLowerCase() === toolName.toLowerCase()) {
        return mapping
      }
    }
    return undefined
  }

  /**
   * Generate alternative name for conflict resolution
   */
  private generateAlternativeName(baseName: string, serverConfig: MCPServerConfig): string {
    const separator = this.config.separator || ':'
    let counter = 1
    let candidateName: string

    do {
      if (this.config.autoPrefix?.enabled) {
        const format = this.config.autoPrefix.format
        const prefix = format
          .replace('{server}', serverConfig.id)
          .replace('{index}', counter.toString())
        candidateName = `${prefix}${separator}${baseName}`
      } else {
        candidateName = `${baseName}${separator}${counter}`
      }
      counter++
    } while (this.findConflictingMapping(candidateName) && counter < 100)

    if (counter >= 100) {
      throw new Error(`Could not generate unique name for ${baseName} after 100 attempts`)
    }

    return candidateName
  }

  /**
   * Check if tool name matches any pattern (supports wildcards)
   */
  private matchesPattern(toolName: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      if (pattern === '*') return true

      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\\./g, '\\\\.')
        .replace(/\\*/g, '.*')
        .replace(/\\?/g, '.')

      const regex = new RegExp(`^${regexPattern}$`, this.config.caseSensitive ? '' : 'i')
      return regex.test(toolName)
    })
  }

  /**
   * Infer category from tool name and description
   */
  private inferCategory(tool: RemoteTool): string {
    const name = tool.name.toLowerCase()
    const description = (tool.description || '').toLowerCase()

    // Simple category inference based on common patterns
    if (name.includes('time') || name.includes('clock') || name.includes('date')) {
      return 'time'
    }
    if (name.includes('weather') || description.includes('weather')) {
      return 'weather'
    }
    if (name.includes('file') || name.includes('read') || name.includes('write')) {
      return 'file'
    }
    if (name.includes('http') || name.includes('api') || name.includes('fetch')) {
      return 'network'
    }
    if (name.includes('db') || name.includes('database') || name.includes('sql')) {
      return 'database'
    }

    return 'general'
  }

  /**
   * Get statistics about namespace usage
   */
  getStatistics() {
    const stats = {
      totalTools: this.mappings.size,
      totalConflicts: this.conflicts.length,
      serverBreakdown: new Map<string, number>(),
      categoryBreakdown: new Map<string, number>(),
      namespaceBreakdown: new Map<string, number>(),
    }

    for (const mapping of this.mappings.values()) {
      // Server breakdown
      const serverCount = stats.serverBreakdown.get(mapping.server) || 0
      stats.serverBreakdown.set(mapping.server, serverCount + 1)

      // Category breakdown
      const category = mapping.metadata?.category || 'unknown'
      const categoryCount = stats.categoryBreakdown.get(category) || 0
      stats.categoryBreakdown.set(category, categoryCount + 1)

      // Namespace breakdown
      const namespaceCount = stats.namespaceBreakdown.get(mapping.namespace) || 0
      stats.namespaceBreakdown.set(mapping.namespace, namespaceCount + 1)
    }

    return stats
  }
}
