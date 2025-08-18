/**
 * Permission management system
 *
 * Handles user permissions and access control for MCP tools
 */

import type { Env, UserPermissions } from '../types.js'

export class PermissionManager {
  constructor(private env: Env) {}

  /**
   * Get user permissions from database
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    try {
      // Query D1 database for user permissions
      const result = await this.env.PERMISSIONS_DB.prepare(
        'SELECT * FROM user_permissions WHERE user_id = ?'
      )
        .bind(userId)
        .first()

      if (!result) {
        // Return default permissions for new users
        return {
          userId,
          servers: [],
          permissions: ['read'],
          groups: ['users'],
        }
      }

      return {
        userId: result.user_id as string,
        servers: JSON.parse(result.servers as string),
        permissions: JSON.parse(result.permissions as string),
        groups: JSON.parse(result.groups as string),
      }
    } catch (error) {
      console.error('Failed to get user permissions:', error)
      // Return minimal permissions on error
      return {
        userId,
        servers: [],
        permissions: [],
        groups: [],
      }
    }
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId)
    return userPerms.permissions.includes(permission)
  }

  /**
   * Check if user has access to specific server
   */
  async hasServerAccess(userId: string, serverId: string): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId)
    return userPerms.servers.includes(serverId) || userPerms.groups.includes('admin')
  }

  /**
   * Grant permission to user
   */
  async grantPermission(userId: string, permission: string): Promise<void> {
    const current = await this.getUserPermissions(userId)
    if (!current.permissions.includes(permission)) {
      current.permissions.push(permission)
      await this.saveUserPermissions(current)
    }
  }

  /**
   * Revoke permission from user
   */
  async revokePermission(userId: string, permission: string): Promise<void> {
    const current = await this.getUserPermissions(userId)
    current.permissions = current.permissions.filter(p => p !== permission)
    await this.saveUserPermissions(current)
  }

  /**
   * Grant server access to user
   */
  async grantServerAccess(userId: string, serverId: string): Promise<void> {
    const current = await this.getUserPermissions(userId)
    if (!current.servers.includes(serverId)) {
      current.servers.push(serverId)
      await this.saveUserPermissions(current)
    }
  }

  /**
   * Revoke server access from user
   */
  async revokeServerAccess(userId: string, serverId: string): Promise<void> {
    const current = await this.getUserPermissions(userId)
    current.servers = current.servers.filter(s => s !== serverId)
    await this.saveUserPermissions(current)
  }

  /**
   * Save user permissions to database
   */
  private async saveUserPermissions(permissions: UserPermissions): Promise<void> {
    await this.env.PERMISSIONS_DB.prepare(
      `INSERT OR REPLACE INTO user_permissions 
       (user_id, servers, permissions, groups, updated_at) 
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        permissions.userId,
        JSON.stringify(permissions.servers),
        JSON.stringify(permissions.permissions),
        JSON.stringify(permissions.groups)
      )
      .run()
  }

  /**
   * Initialize database schema
   */
  static async initializeDatabase(db: D1Database): Promise<void> {
    await db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id TEXT PRIMARY KEY,
        servers TEXT NOT NULL DEFAULT '[]',
        permissions TEXT NOT NULL DEFAULT '["read"]',
        groups TEXT NOT NULL DEFAULT '["users"]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `
      )
      .run()

    await db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS server_registry (
        server_id TEXT PRIMARY KEY,
        server_name TEXT NOT NULL,
        server_type TEXT NOT NULL,
        container_id TEXT,
        config TEXT,
        status TEXT DEFAULT 'inactive',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `
      )
      .run()

    await db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT,
        details TEXT,
        ip_address TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `
      )
      .run()
  }
}

/**
 * Permission checking wrapper for MCP tools
 */
export function requirePermission(permission: string, handler: Function) {
  return async (request: any, context: any) => {
    const userPermissions = context.props?.permissions || []

    if (!userPermissions.includes(permission)) {
      // Log the denied access attempt
      console.warn('Permission denied:', {
        userId: context.props?.claims?.sub,
        requiredPermission: permission,
        userPermissions,
      })

      return {
        content: [
          {
            type: 'text',
            text: `Permission denied: This action requires '${permission}' permission`,
          },
        ],
        status: 403,
      }
    }

    // Permission granted, execute the handler
    return handler(request, context)
  }
}

/**
 * Server access checking wrapper
 */
export function requireServerAccess(handler: Function) {
  return async (request: any, context: any) => {
    const { serverId } = request
    const userId = context.props?.claims?.sub

    if (!userId) {
      return {
        content: [
          {
            type: 'text',
            text: 'Authentication required',
          },
        ],
        status: 401,
      }
    }

    const permManager = new PermissionManager(context.env)
    const hasAccess = await permManager.hasServerAccess(userId, serverId)

    if (!hasAccess) {
      console.warn('Server access denied:', {
        userId,
        serverId,
      })

      return {
        content: [
          {
            type: 'text',
            text: `Access denied: You don't have access to server '${serverId}'`,
          },
        ],
        status: 403,
      }
    }

    return handler(request, context)
  }
}
