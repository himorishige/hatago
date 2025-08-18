/**
 * ResourceLinks support for MCP Tools
 * Enables efficient handling of large files and resources
 */

import type {
  ResourceContents,
  ResourceLink,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js'

/**
 * Tool result content types as per MCP specification
 */
export type ToolResultContent = TextContent | ResourceContents | ResourceLink

/**
 * Check if content is a ResourceLink
 */
export function isResourceLink(content: ToolResultContent): content is ResourceLink {
  return content.type === 'resource_link'
}

/**
 * Check if content is a ResourceContent
 */
export function isResourceContent(content: ToolResultContent): content is ResourceContents {
  return content.type === 'resource'
}

/**
 * Check if content is a TextContent
 */
export function isTextContent(content: ToolResultContent): content is TextContent {
  return content.type === 'text'
}

/**
 * Create a ResourceLink for large files
 * This avoids embedding large content directly in tool results
 */
export function createResourceLink(
  uri: string,
  name: string,
  options?: {
    mimeType?: string
    description?: string
  }
): ResourceLink {
  return {
    type: 'resource_link',
    uri,
    name,
    ...(options?.mimeType && { mimeType: options.mimeType }),
    ...(options?.description && { description: options.description }),
  }
}

/**
 * Create ResourceLinks for multiple files
 */
export function createResourceLinks(
  files: Array<{
    uri: string
    name: string
    mimeType?: string
    description?: string
  }>
): ResourceLink[] {
  return files.map(file => {
    const options: { mimeType?: string; description?: string } = {}
    if (file.mimeType) options.mimeType = file.mimeType
    if (file.description) options.description = file.description
    return createResourceLink(file.uri, file.name, options)
  })
}

/**
 * Helper to determine if a file should use ResourceLink based on size
 * @param sizeBytes File size in bytes
 * @param threshold Threshold in bytes (default: 100KB)
 */
export function shouldUseResourceLink(
  sizeBytes: number,
  threshold = 100 * 1024 // 100KB
): boolean {
  return sizeBytes > threshold
}

/**
 * Convert file info to appropriate content type based on size
 */
export function fileToContent(
  file: {
    uri: string
    name: string
    content: string
    sizeBytes: number
    mimeType?: string
    description?: string
  },
  threshold = 100 * 1024
): ToolResultContent {
  if (shouldUseResourceLink(file.sizeBytes, threshold)) {
    // Use ResourceLink for large files
    const options: { mimeType?: string; description?: string } = {}
    if (file.mimeType) options.mimeType = file.mimeType
    if (file.description) options.description = file.description
    return createResourceLink(file.uri, file.name, options)
  }
  // Embed small files as ResourceContent
  return {
    type: 'resource',
    resource: {
      uri: file.uri,
      text: file.content,
      ...(file.mimeType && { mimeType: file.mimeType }),
    },
  } as unknown as ResourceContents
}

/**
 * Extract all ResourceLinks from tool result
 */
export function extractResourceLinks(contents: ToolResultContent[]): ResourceLink[] {
  return contents.filter(isResourceLink)
}

/**
 * Resolve ResourceLinks to their actual content
 * This would typically call the resources/read endpoint
 */
export interface ResourceResolver {
  read(uri: string): Promise<{ content: string; mimeType?: string }>
}

/**
 * Resolve all ResourceLinks in tool result
 */
export async function resolveResourceLinks(
  contents: ToolResultContent[],
  resolver: ResourceResolver
): Promise<ToolResultContent[]> {
  const resolved = await Promise.all(
    contents.map(async content => {
      if (isResourceLink(content)) {
        try {
          const { content: text, mimeType } = await resolver.read(content.uri)
          return {
            type: 'resource',
            resource: {
              uri: content.uri,
              text,
              ...(mimeType && { mimeType }),
            },
          } as unknown as ResourceContents
        } catch (error) {
          // If resolution fails, keep as ResourceLink
          console.error(`Failed to resolve ResourceLink: ${content.uri}`, error)
          return content
        }
      }
      return content
    })
  )

  return resolved
}
