/**
 * NamespaceManager テスト
 * ツール名の名前空間管理、衝突解決、統計情報の取得をテスト
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { NamespaceManager } from '../../../src/config/namespace-manager.js'
import type { ProxyConfig, MCPServerConfig } from '../../../src/config/types.js'

describe('NamespaceManager', () => {
  let namespaceManager: NamespaceManager
  let defaultConfig: ProxyConfig
  let server1: MCPServerConfig
  let server2: MCPServerConfig

  beforeEach(() => {
    defaultConfig = {
      servers: [],
      namespaceStrategy: 'prefix',
      conflictResolution: 'error',
      namespace: {
        separator: '_',
        caseSensitive: false,
        maxLength: 64,
        autoPrefix: {
          enabled: true,
          format: '{server}_{index}',
        },
      },
    }

    server1 = {
      id: 'server1',
      endpoint: 'http://localhost:3000',
      description: 'Test server 1',
    }

    server2 = {
      id: 'server2',
      endpoint: 'http://localhost:3001',
      description: 'Test server 2',
    }

    namespaceManager = new NamespaceManager(defaultConfig)
  })

  describe('Tool Registration', () => {
    it('should register tool with prefix namespace strategy', () => {
      const tool = { name: 'test_tool' }

      const finalName = namespaceManager.registerTool(server1, tool)

      expect(finalName).toBe('server1_test_tool')
    })

    it('should register tool with flat namespace strategy', () => {
      const config = { ...defaultConfig, namespaceStrategy: 'flat' as const }
      namespaceManager = new NamespaceManager(config)

      const tool = { name: 'test_tool' }

      const finalName = namespaceManager.registerTool(server1, tool)

      expect(finalName).toBe('test_tool')
    })

    it('should handle case insensitive tool names', () => {
      const tool1 = { name: 'TEST_TOOL' }
      const tool2 = { name: 'test_tool' }

      const name1 = namespaceManager.registerTool(server1, tool1)
      const name2 = namespaceManager.registerTool(server2, tool2)

      expect(name1).toBe('server1_test_tool')
      expect(name2).toBe('server2_test_tool')
    })

    it('should handle case sensitive tool names when configured', () => {
      const config = {
        ...defaultConfig,
        namespace: {
          ...defaultConfig.namespace,
          caseSensitive: true,
        },
      }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'TEST_TOOL' }
      const tool2 = { name: 'test_tool' }

      const name1 = namespaceManager.registerTool(server1, tool1)
      const name2 = namespaceManager.registerTool(server1, tool2)

      expect(name1).toBe('server1_TEST_TOOL')
      expect(name2).toBe('server1_test_tool')
    })

    it('should respect custom separator', () => {
      const config = {
        ...defaultConfig,
        namespace: {
          ...defaultConfig.namespace,
          separator: '::',
        },
      }
      namespaceManager = new NamespaceManager(config)

      const tool = { name: 'test_tool' }

      const finalName = namespaceManager.registerTool(server1, tool)

      expect(finalName).toBe('server1::test_tool')
    })

    it('should enforce maximum length limits', () => {
      const config = {
        ...defaultConfig,
        namespace: {
          ...defaultConfig.namespace,
          maxLength: 20,
        },
      }
      namespaceManager = new NamespaceManager(config)

      const tool = { name: 'very_long_tool_name_that_exceeds_limit' }

      const finalName = namespaceManager.registerTool(server1, tool)

      expect(finalName.length).toBeLessThanOrEqual(20)
      expect(finalName).toContain('server1')
    })
  })

  describe('Conflict Resolution', () => {
    it('should throw error on conflict with error strategy', () => {
      const config = { ...defaultConfig, conflictResolution: 'error' as const }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'test_tool' }
      const tool2 = { name: 'test_tool' }

      namespaceManager.registerTool(server1, tool1)

      expect(() => {
        namespaceManager.registerTool(server1, tool2)
      }).toThrow()
    })

    it('should use first tool with first-wins strategy', () => {
      const config = { ...defaultConfig, conflictResolution: 'first-wins' as const }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'test_tool', description: 'First tool' }
      const tool2 = { name: 'test_tool', description: 'Second tool' }

      const name1 = namespaceManager.registerTool(server1, tool1)
      const name2 = namespaceManager.registerTool(server2, tool2)

      expect(name1).toBe('server1_test_tool')
      expect(name2).toBe('server1_test_tool') // 同じ名前が返される

      const conflicts = namespaceManager.getConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].toolName).toBe('test_tool')
    })

    it('should prompt user with prompt strategy', () => {
      const config = { ...defaultConfig, conflictResolution: 'prompt' as const }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'test_tool' }
      const tool2 = { name: 'test_tool' }

      namespaceManager.registerTool(server1, tool1)

      // プロンプト戦略では衝突を記録するが続行する
      const name2 = namespaceManager.registerTool(server2, tool2)

      const conflicts = namespaceManager.getConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].suggestion).toBeDefined()
    })

    it('should detect conflicts across different servers in flat mode', () => {
      const config = {
        ...defaultConfig,
        namespaceStrategy: 'flat' as const,
        conflictResolution: 'error' as const,
      }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'common_tool' }
      const tool2 = { name: 'common_tool' }

      namespaceManager.registerTool(server1, tool1)

      expect(() => {
        namespaceManager.registerTool(server2, tool2)
      }).toThrow()
    })
  })

  describe('Tool Exclusion', () => {
    it('should exclude tools based on server configuration', () => {
      const serverWithExclusions: MCPServerConfig = {
        ...server1,
        excludeTools: ['excluded_tool', 'another_*'],
      }

      const tool = { name: 'excluded_tool' }

      expect(() => {
        namespaceManager.registerTool(serverWithExclusions, tool)
      }).toThrow('Tool excluded_tool is excluded')
    })

    it('should handle wildcard exclusions', () => {
      const serverWithExclusions: MCPServerConfig = {
        ...server1,
        excludeTools: ['test_*'],
      }

      const tool1 = { name: 'test_tool' }
      const tool2 = { name: 'other_tool' }

      expect(() => {
        namespaceManager.registerTool(serverWithExclusions, tool1)
      }).toThrow('Tool test_tool is excluded')

      // これは除外されない
      const finalName = namespaceManager.registerTool(serverWithExclusions, tool2)
      expect(finalName).toBe('server1_other_tool')
    })

    it('should include only specified tools when includeTools is set', () => {
      const serverWithInclusions: MCPServerConfig = {
        ...server1,
        includeTools: ['allowed_tool'],
      }

      const allowedTool = { name: 'allowed_tool' }
      const disallowedTool = { name: 'disallowed_tool' }

      const finalName = namespaceManager.registerTool(serverWithInclusions, allowedTool)
      expect(finalName).toBe('server1_allowed_tool')

      expect(() => {
        namespaceManager.registerTool(serverWithInclusions, disallowedTool)
      }).toThrow('Tool disallowed_tool is excluded')
    })
  })

  describe('Statistics and Reporting', () => {
    it('should provide accurate statistics', () => {
      const tool1 = { name: 'tool1' }
      const tool2 = { name: 'tool2' }
      const tool3 = { name: 'tool3' }

      namespaceManager.registerTool(server1, tool1)
      namespaceManager.registerTool(server1, tool2)
      namespaceManager.registerTool(server2, tool3)

      const stats = namespaceManager.getStatistics()

      expect(stats.totalTools).toBe(3)
      expect(stats.totalConflicts).toBe(0)
      expect(stats.serverCounts).toEqual({
        server1: 2,
        server2: 1,
      })
    })

    it('should track conflicts in statistics', () => {
      const config = { ...defaultConfig, conflictResolution: 'first-wins' as const }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'same_tool' }
      const tool2 = { name: 'same_tool' }

      namespaceManager.registerTool(server1, tool1)
      namespaceManager.registerTool(server2, tool2)

      const stats = namespaceManager.getStatistics()
      expect(stats.totalConflicts).toBe(1)
    })

    it('should provide detailed conflict information', () => {
      const config = { ...defaultConfig, conflictResolution: 'prompt' as const }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'conflict_tool', description: 'First' }
      const tool2 = { name: 'conflict_tool', description: 'Second' }

      namespaceManager.registerTool(server1, tool1)
      namespaceManager.registerTool(server2, tool2)

      const conflicts = namespaceManager.getConflicts()
      expect(conflicts).toHaveLength(1)

      const conflict = conflicts[0]
      expect(conflict.toolName).toBe('conflict_tool')
      expect(conflict.existing.server).toBe('server1')
      expect(conflict.attempted.server).toBe('server2')
      expect(conflict.suggestion).toContain('server2')
    })
  })

  describe('Auto Prefix Generation', () => {
    it('should generate auto prefix when enabled', () => {
      const config = {
        ...defaultConfig,
        namespace: {
          ...defaultConfig.namespace,
          autoPrefix: {
            enabled: true,
            format: '{index}_{server}',
          },
        },
      }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'tool' }
      const tool2 = { name: 'tool' }

      const name1 = namespaceManager.registerTool(server1, tool1)
      const name2 = namespaceManager.registerTool(server1, tool2)

      expect(name1).toBe('server1_tool')
      expect(name2).toBe('2_server1_tool') // 2番目なので index が追加される
    })

    it('should handle custom auto prefix format', () => {
      const config = {
        ...defaultConfig,
        namespace: {
          ...defaultConfig.namespace,
          autoPrefix: {
            enabled: true,
            format: 'v{index}_{server}',
          },
        },
      }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'tool' }
      const tool2 = { name: 'tool' }

      namespaceManager.registerTool(server1, tool1)
      const name2 = namespaceManager.registerTool(server1, tool2)

      expect(name2).toBe('v2_server1_tool')
    })

    it('should disable auto prefix when configured', () => {
      const config = {
        ...defaultConfig,
        namespace: {
          ...defaultConfig.namespace,
          autoPrefix: {
            enabled: false,
            format: '{server}_{index}',
          },
        },
        conflictResolution: 'error' as const,
      }
      namespaceManager = new NamespaceManager(config)

      const tool1 = { name: 'tool' }
      const tool2 = { name: 'tool' }

      namespaceManager.registerTool(server1, tool1)

      // auto prefix が無効なので、衝突時にエラーが発生する
      expect(() => {
        namespaceManager.registerTool(server1, tool2)
      }).toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty tool names', () => {
      const tool = { name: '' }

      expect(() => {
        namespaceManager.registerTool(server1, tool)
      }).toThrow()
    })

    it('should handle special characters in tool names', () => {
      const tool = { name: 'tool-with-dash.and.dot' }

      const finalName = namespaceManager.registerTool(server1, tool)

      expect(finalName).toBe('server1_tool-with-dash.and.dot')
    })

    it('should handle very long server IDs', () => {
      const longServer: MCPServerConfig = {
        id: 'very_long_server_id_that_might_cause_issues',
        endpoint: 'http://localhost:3000',
      }

      const tool = { name: 'tool' }

      const finalName = namespaceManager.registerTool(longServer, tool)

      expect(finalName).toContain('very_long_server_id_that_might_cause_issues')
      expect(finalName.length).toBeLessThanOrEqual(64) // デフォルトの maxLength
    })

    it('should handle server IDs with special characters', () => {
      const specialServer: MCPServerConfig = {
        id: 'server-1.test',
        endpoint: 'http://localhost:3000',
      }

      const tool = { name: 'tool' }

      const finalName = namespaceManager.registerTool(specialServer, tool)

      expect(finalName).toBe('server-1.test_tool')
    })
  })
})
