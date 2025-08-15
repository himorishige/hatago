"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  StreamableHTTPTransport: () => StreamableHTTPTransport
});
module.exports = __toCommonJS(index_exports);
var import_types = require("@modelcontextprotocol/sdk/types.js");
var import_http_exception = require("hono/http-exception");

// src/streaming.ts
var import_streaming = require("hono/streaming");
var isOldBunVersion = () => {
  const version = typeof Bun !== "undefined" ? Bun.version : void 0;
  if (version === void 0) {
    return false;
  }
  const result = version.startsWith("1.1") || version.startsWith("1.0") || version.startsWith("0.");
  isOldBunVersion = () => result;
  return result;
};
var run = async (stream, cb, onError) => {
  try {
    await cb(stream);
  } catch (e) {
    if (e instanceof Error && onError) {
      await onError(e, stream);
      await stream.writeSSE({
        event: "error",
        data: e.message
      });
    } else {
      console.error(e);
    }
  }
};
var contextStash = /* @__PURE__ */ new WeakMap();
var streamSSE = (c, cb, onError) => {
  const { readable, writable } = new TransformStream();
  const stream = new import_streaming.SSEStreamingApi(writable, readable);
  if (isOldBunVersion()) {
    c.req.raw.signal.addEventListener("abort", () => {
      if (!stream.closed) {
        stream.abort();
      }
    });
  }
  contextStash.set(stream.responseReadable, c);
  c.header("Transfer-Encoding", "chunked");
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  run(stream, cb, onError);
  return c.newResponse(stream.responseReadable);
};

// src/index.ts
var StreamableHTTPTransport = class {
  #started = false;
  #initialized = false;
  #onsessioninitialized;
  #sessionIdGenerator;
  #eventStore;
  #enableJsonResponse = false;
  #standaloneSseStreamId = "_GET_stream";
  #streamMapping = /* @__PURE__ */ new Map();
  #requestToStreamMapping = /* @__PURE__ */ new Map();
  #requestResponseMap = /* @__PURE__ */ new Map();
  sessionId;
  onclose;
  onerror;
  onmessage;
  constructor(options) {
    this.#sessionIdGenerator = options?.sessionIdGenerator;
    this.#enableJsonResponse = options?.enableJsonResponse ?? false;
    this.#eventStore = options?.eventStore;
    this.#onsessioninitialized = options?.onsessioninitialized;
  }
  /**
   * Starts the transport. This is required by the Transport interface but is a no-op
   * for the Streamable HTTP transport as connections are managed per-request.
   */
  async start() {
    if (this.#started) {
      throw new Error("Transport already started");
    }
    this.#started = true;
  }
  /**
   * Handles an incoming HTTP request, whether GET or POST
   */
  async handleRequest(ctx, parsedBody) {
    switch (ctx.req.method) {
      case "GET":
        return this.handleGetRequest(ctx);
      case "POST":
        return this.handlePostRequest(ctx, parsedBody);
      case "DELETE":
        return this.handleDeleteRequest(ctx);
      default:
        return this.handleUnsupportedRequest(ctx);
    }
  }
  /**
   * Handles GET requests for SSE stream
   */
  async handleGetRequest(ctx) {
    try {
      const acceptHeader = ctx.req.header("Accept");
      if (!acceptHeader?.includes("text/event-stream")) {
        throw new import_http_exception.HTTPException(406, {
          res: Response.json({
            jsonrpc: "2.0",
            error: {
              code: -32e3,
              message: "Not Acceptable: Client must accept text/event-stream"
            },
            id: null
          })
        });
      }
      this.validateSession(ctx);
      if (this.sessionId !== void 0) {
        ctx.header("mcp-session-id", this.sessionId);
      }
      let streamId = this.#standaloneSseStreamId;
      if (this.#eventStore) {
        const lastEventId = ctx.req.header("last-event-id");
        if (lastEventId) {
          streamId = (stream) => this.#eventStore.replayEventsAfter(lastEventId, {
            send: async (eventId, message) => {
              try {
                await stream.writeSSE({
                  id: eventId,
                  event: "message",
                  data: JSON.stringify(message)
                });
              } catch {
                this.onerror?.(new Error("Failed replay events"));
                throw new import_http_exception.HTTPException(500, {
                  message: "Failed replay events"
                });
              }
            }
          });
        }
      }
      if (typeof streamId === "string" && this.#streamMapping.get(streamId) !== void 0) {
        throw new import_http_exception.HTTPException(409, {
          res: Response.json({
            jsonrpc: "2.0",
            error: {
              code: -32e3,
              message: "Conflict: Only one SSE stream is allowed per session"
            },
            id: null
          })
        });
      }
      return streamSSE(ctx, async (stream) => {
        const resolvedStreamId = typeof streamId === "string" ? streamId : await streamId(stream);
        this.#streamMapping.set(resolvedStreamId, {
          ctx,
          stream
        });
        const keepAlive = setInterval(() => {
          if (!stream.closed) {
            stream.writeSSE({ data: "", event: "ping" }).catch(() => {
              clearInterval(keepAlive);
            });
          }
        }, 3e4);
        stream.onAbort(() => {
          this.#streamMapping.delete(resolvedStreamId);
          clearInterval(keepAlive);
        });
      });
    } catch (error) {
      if (error instanceof import_http_exception.HTTPException) {
        throw error;
      }
      this.onerror?.(error);
      throw new import_http_exception.HTTPException(400, {
        res: Response.json({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
            data: String(error)
          },
          id: null
        })
      });
    }
  }
  /**
   * Handles POST requests containing JSON-RPC messages
   */
  async handlePostRequest(ctx, parsedBody) {
    try {
      const acceptHeader = ctx.req.header("Accept");
      if (!acceptHeader?.includes("application/json") || !acceptHeader.includes("text/event-stream")) {
        throw new import_http_exception.HTTPException(406, {
          res: Response.json({
            jsonrpc: "2.0",
            error: {
              code: -32e3,
              message: "Not Acceptable: Client must accept both application/json and text/event-stream"
            },
            id: null
          })
        });
      }
      const ct = ctx.req.header("Content-Type");
      if (!ct?.includes("application/json")) {
        throw new import_http_exception.HTTPException(415, {
          res: Response.json({
            jsonrpc: "2.0",
            error: {
              code: -32e3,
              message: "Unsupported Media Type: Content-Type must be application/json"
            },
            id: null
          })
        });
      }
      const authInfo = ctx.get("auth");
      let rawMessage = parsedBody;
      if (rawMessage === void 0) {
        rawMessage = await ctx.req.json();
      }
      let messages;
      if (Array.isArray(rawMessage)) {
        messages = rawMessage.map((msg) => import_types.JSONRPCMessageSchema.parse(msg));
      } else {
        messages = [import_types.JSONRPCMessageSchema.parse(rawMessage)];
      }
      const isInitializationRequest = messages.some(import_types.isInitializeRequest);
      if (isInitializationRequest) {
        if (this.#initialized && this.sessionId !== void 0) {
          throw new import_http_exception.HTTPException(400, {
            res: Response.json({
              jsonrpc: "2.0",
              error: {
                code: -32600,
                message: "Invalid Request: Server already initialized"
              },
              id: null
            })
          });
        }
        if (messages.length > 1) {
          throw new import_http_exception.HTTPException(400, {
            res: Response.json({
              jsonrpc: "2.0",
              error: {
                code: -32600,
                message: "Invalid Request: Only one initialization request is allowed"
              },
              id: null
            })
          });
        }
        this.sessionId = this.#sessionIdGenerator?.();
        this.#initialized = true;
        if (this.sessionId && this.#onsessioninitialized) {
          this.#onsessioninitialized(this.sessionId);
        }
      }
      if (!isInitializationRequest) {
        this.validateSession(ctx);
      }
      const hasRequests = messages.some(import_types.isJSONRPCRequest);
      if (!hasRequests) {
        for (const message of messages) {
          this.onmessage?.(message, { authInfo });
        }
        return ctx.body(null, 202);
      }
      if (hasRequests) {
        const streamId = crypto.randomUUID();
        if (!this.#enableJsonResponse && this.sessionId !== void 0) {
          ctx.header("mcp-session-id", this.sessionId);
        }
        if (this.#enableJsonResponse) {
          const result = await new Promise((resolve) => {
            for (const message of messages) {
              if ((0, import_types.isJSONRPCRequest)(message)) {
                this.#streamMapping.set(streamId, {
                  ctx: {
                    header: ctx.header,
                    json: resolve
                  }
                });
                this.#requestToStreamMapping.set(message.id, streamId);
              }
            }
            for (const message of messages) {
              this.onmessage?.(message, { authInfo });
            }
          });
          return ctx.json(result);
        }
        return streamSSE(ctx, async (stream) => {
          for (const message of messages) {
            if ((0, import_types.isJSONRPCRequest)(message)) {
              this.#streamMapping.set(streamId, {
                ctx,
                stream
              });
              this.#requestToStreamMapping.set(message.id, streamId);
            }
          }
          stream.onAbort(() => {
            this.#streamMapping.delete(streamId);
          });
          for (const message of messages) {
            this.onmessage?.(message, { authInfo });
          }
        });
      }
    } catch (error) {
      if (error instanceof import_http_exception.HTTPException) {
        throw error;
      }
      this.onerror?.(error);
      throw new import_http_exception.HTTPException(400, {
        res: Response.json({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
            data: String(error)
          },
          id: null
        })
      });
    }
  }
  /**
   * Handles DELETE requests to terminate sessions
   */
  async handleDeleteRequest(ctx) {
    this.validateSession(ctx);
    await this.close();
    return ctx.body(null, 200);
  }
  /**
   * Handles unsupported requests (PUT, PATCH, etc.)
   */
  handleUnsupportedRequest(ctx) {
    return ctx.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32e3,
          message: "Method not allowed."
        },
        id: null
      },
      {
        status: 405,
        headers: {
          Allow: "GET, POST, DELETE"
        }
      }
    );
  }
  /**
   * Validates session ID for non-initialization requests
   * Returns true if the session is valid, false otherwise
   */
  validateSession(ctx) {
    if (this.#sessionIdGenerator === void 0) {
      return true;
    }
    if (!this.#initialized) {
      throw new import_http_exception.HTTPException(400, {
        res: Response.json({
          jsonrpc: "2.0",
          error: {
            code: -32e3,
            message: "Bad Request: Server not initialized"
          },
          id: null
        })
      });
    }
    const sessionId = ctx.req.header("mcp-session-id");
    if (!sessionId) {
      throw new import_http_exception.HTTPException(400, {
        res: Response.json({
          jsonrpc: "2.0",
          error: {
            code: -32e3,
            message: "Bad Request: Mcp-Session-Id header is required"
          },
          id: null
        })
      });
    }
    if (Array.isArray(sessionId)) {
      throw new import_http_exception.HTTPException(400, {
        res: Response.json({
          jsonrpc: "2.0",
          error: {
            code: -32e3,
            message: "Bad Request: Mcp-Session-Id header must be a single value"
          },
          id: null
        })
      });
    }
    if (sessionId !== this.sessionId) {
      throw new import_http_exception.HTTPException(404, {
        res: Response.json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Session not found"
          },
          id: null
        })
      });
    }
    return true;
  }
  async close() {
    for (const { stream } of this.#streamMapping.values()) {
      stream?.close();
    }
    this.#streamMapping.clear();
    this.#requestResponseMap.clear();
    this.onclose?.();
  }
  async send(message, options) {
    let requestId = options?.relatedRequestId;
    if ((0, import_types.isJSONRPCResponse)(message) || (0, import_types.isJSONRPCError)(message)) {
      requestId = message.id;
    }
    if (requestId === void 0) {
      if ((0, import_types.isJSONRPCResponse)(message) || (0, import_types.isJSONRPCError)(message)) {
        throw new Error(
          "Cannot send a response on a standalone SSE stream unless resuming a previous client request"
        );
      }
      const standaloneSse = this.#streamMapping.get(this.#standaloneSseStreamId);
      if (standaloneSse === void 0) {
        return;
      }
      let eventId;
      if (this.#eventStore) {
        eventId = await this.#eventStore.storeEvent(this.#standaloneSseStreamId, message);
      }
      return standaloneSse.stream?.writeSSE({
        id: eventId,
        event: "message",
        data: JSON.stringify(message)
      });
    }
    const streamId = this.#requestToStreamMapping.get(requestId);
    const response = this.#streamMapping.get(streamId);
    if (!streamId) {
      throw new Error(`No connection established for request ID: ${String(requestId)}`);
    }
    if (!this.#enableJsonResponse) {
      let eventId;
      if (this.#eventStore) {
        eventId = await this.#eventStore.storeEvent(streamId, message);
      }
      if (response) {
        await response.stream?.writeSSE({
          id: eventId,
          event: "message",
          data: JSON.stringify(message)
        });
      }
    }
    if ((0, import_types.isJSONRPCResponse)(message) || (0, import_types.isJSONRPCError)(message)) {
      this.#requestResponseMap.set(requestId, message);
      const relatedIds = Array.from(this.#requestToStreamMapping.entries()).filter(([, streamId2]) => this.#streamMapping.get(streamId2) === response).map(([id]) => id);
      const allResponsesReady = relatedIds.every((id) => this.#requestResponseMap.has(id));
      if (allResponsesReady) {
        if (!response) {
          throw new Error(`No connection established for request ID: ${String(requestId)}`);
        }
        if (this.#enableJsonResponse) {
          if (this.sessionId !== void 0) {
            response.ctx.header("mcp-session-id", this.sessionId);
          }
          const responses = relatedIds.map((id) => this.#requestResponseMap.get(id));
          response.ctx.json(responses.length === 1 ? responses[0] : responses);
          return;
        } else {
          response.stream?.close();
        }
        for (const id of relatedIds) {
          this.#requestResponseMap.delete(id);
          this.#requestToStreamMapping.delete(id);
        }
      }
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  StreamableHTTPTransport
});
