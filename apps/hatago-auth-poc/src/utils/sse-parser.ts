/**
 * SSE (Server-Sent Events) Parser Utility
 *
 * Parses SSE responses from MCP servers that use streaming
 */

export interface SSEMessage {
  event?: string
  data: string
  id?: string
}

/**
 * Parse SSE formatted text into messages
 */
export function parseSSEText(text: string): SSEMessage[] {
  const messages: SSEMessage[] = []
  const lines = text.split('\n')

  let currentMessage: Partial<SSEMessage> = {}

  for (const line of lines) {
    if (line === '') {
      // Empty line indicates end of message
      if (currentMessage.data) {
        messages.push(currentMessage as SSEMessage)
      }
      currentMessage = {}
      continue
    }

    if (line.startsWith('event:')) {
      currentMessage.event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      currentMessage.data = line.slice(5).trim()
    } else if (line.startsWith('id:')) {
      currentMessage.id = line.slice(3).trim()
    }
  }

  // Add last message if exists
  if (currentMessage.data) {
    messages.push(currentMessage as SSEMessage)
  }

  return messages
}

/**
 * Parse SSE stream and extract JSON-RPC response
 */
export async function parseSSEResponse(response: Response): Promise<any> {
  const text = await response.text()
  const messages = parseSSEText(text)

  // Find the message with JSON-RPC response
  for (const message of messages) {
    if (message.event === 'message' || !message.event) {
      try {
        const data = JSON.parse(message.data)
        if (data.jsonrpc === '2.0') {
          return data
        }
      } catch {
        // Ignore non-JSON data
      }
    }
  }

  throw new Error('No valid JSON-RPC response found in SSE stream')
}

/**
 * Extract session ID from response headers
 */
export function extractSessionId(response: Response): string | undefined {
  return response.headers.get('mcp-session-id') || undefined
}

/**
 * Parse streaming SSE response with progress notifications
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<any, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')

      // Keep the last incomplete line in buffer
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          try {
            const parsed = JSON.parse(data)
            yield parsed
          } catch {
            // Skip non-JSON data (like "ping")
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
