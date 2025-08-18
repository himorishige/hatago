/**
 * SSE Parser Helper
 * Parses Server-Sent Events responses
 */

export interface SSEEvent {
  id?: string
  event?: string
  data?: any
  retry?: number
}

export class SSEParser {
  private buffer = ''
  private events: SSEEvent[] = []

  /**
   * Parse SSE text response
   */
  static parse(text: string): SSEEvent[] {
    const parser = new SSEParser()
    return parser.parseText(text)
  }

  /**
   * Parse SSE stream response
   */
  static async parseStream(response: Response): Promise<SSEEvent[]> {
    if (!response.body) {
      throw new Error('Response has no body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parser = new SSEParser()
    const events: SSEEvent[] = []

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const newEvents = parser.parseChunk(chunk)
        events.push(...newEvents)
      }

      // Parse any remaining buffer
      const finalEvents = parser.flush()
      events.push(...finalEvents)

      return events
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Parse complete SSE text
   */
  parseText(text: string): SSEEvent[] {
    const lines = text.split('\n')
    let currentEvent: Partial<SSEEvent> = {}
    const events: SSEEvent[] = []

    for (const line of lines) {
      if (line === '' || line === '\r') {
        // End of event
        if (Object.keys(currentEvent).length > 0) {
          events.push(this.processEvent(currentEvent))
          currentEvent = {}
        }
      } else if (line.startsWith(':')) {
      } else {
        const colonIndex = line.indexOf(':')
        if (colonIndex === -1) {
          // Field with no value
          currentEvent[line as keyof SSEEvent] = true as any
        } else {
          const field = line.slice(0, colonIndex)
          let value = line.slice(colonIndex + 1)

          // Remove leading space if present
          if (value.startsWith(' ')) {
            value = value.slice(1)
          }

          this.processField(currentEvent, field, value)
        }
      }
    }

    // Process final event if exists
    if (Object.keys(currentEvent).length > 0) {
      events.push(this.processEvent(currentEvent))
    }

    return events
  }

  /**
   * Parse SSE chunk (for streaming)
   */
  parseChunk(chunk: string): SSEEvent[] {
    this.buffer += chunk
    const events: SSEEvent[] = []

    // Process complete lines
    const lines = this.buffer.split('\n')

    // Keep last incomplete line in buffer
    this.buffer = lines.pop() ?? ''

    let currentEvent: Partial<SSEEvent> = {}

    for (const line of lines) {
      if (line === '' || line === '\r') {
        // End of event
        if (Object.keys(currentEvent).length > 0) {
          events.push(this.processEvent(currentEvent))
          currentEvent = {}
        }
      } else if (line.startsWith(':')) {
      } else {
        const colonIndex = line.indexOf(':')
        if (colonIndex === -1) {
          // Field with no value
          currentEvent[line as keyof SSEEvent] = true as any
        } else {
          const field = line.slice(0, colonIndex)
          let value = line.slice(colonIndex + 1)

          // Remove leading space if present
          if (value.startsWith(' ')) {
            value = value.slice(1)
          }

          this.processField(currentEvent, field, value)
        }
      }
    }

    // Store partial event for next chunk
    if (Object.keys(currentEvent).length > 0) {
      this.events.push(currentEvent as SSEEvent)
    }

    return events
  }

  /**
   * Flush any remaining events
   */
  flush(): SSEEvent[] {
    const events = [...this.events]
    this.events = []

    if (this.buffer.trim()) {
      // Process remaining buffer as a line
      const remainingEvents = this.parseText(`${this.buffer}\n\n`)
      events.push(...remainingEvents)
    }

    this.buffer = ''
    return events
  }

  /**
   * Process a field
   */
  private processField(event: Partial<SSEEvent>, field: string, value: string): void {
    switch (field) {
      case 'id':
        event.id = value
        break

      case 'event':
        event.event = value
        break

      case 'data':
        // Concatenate multiple data fields
        if (event.data === undefined) {
          event.data = value
        } else {
          event.data += `\n${value}`
        }
        break

      case 'retry': {
        const retryValue = Number.parseInt(value, 10)
        if (!Number.isNaN(retryValue)) {
          event.retry = retryValue
        }
        break
      }
    }
  }

  /**
   * Process event data
   */
  private processEvent(event: Partial<SSEEvent>): SSEEvent {
    const processed: SSEEvent = {}

    if (event.id !== undefined) processed.id = event.id
    if (event.event !== undefined) processed.event = event.event
    if (event.retry !== undefined) processed.retry = event.retry

    // Try to parse data as JSON
    if (event.data !== undefined) {
      try {
        processed.data = JSON.parse(event.data as string)
      } catch {
        processed.data = event.data
      }
    }

    return processed
  }
}

/**
 * Extract MCP messages from SSE events
 */
export function extractMCPMessages(events: SSEEvent[]): any[] {
  return events.filter(e => e.data?.jsonrpc === '2.0').map(e => e.data)
}

/**
 * Extract progress notifications from SSE events
 */
export function extractProgressNotifications(events: SSEEvent[]): any[] {
  return events
    .filter(e => e.data?.jsonrpc === '2.0' && e.data?.method === 'notifications/progress')
    .map(e => e.data.params)
}

/**
 * Find result message in SSE events
 */
export function findResultMessage(events: SSEEvent[], id?: number | string): any {
  const result = events.find(
    e =>
      e.data?.jsonrpc === '2.0' &&
      (id === undefined || e.data.id === id) &&
      (e.data.result !== undefined || e.data.error !== undefined)
  )

  if (result?.data?.error) {
    throw new Error(`MCP Error ${result.data.error.code}: ${result.data.error.message}`)
  }

  return result?.data?.result
}
