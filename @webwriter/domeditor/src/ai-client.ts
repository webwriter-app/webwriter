import type {AIProviderConfig} from "./ai-provider"

export type AIEffort = "low" | "medium" | "high"

export type AIAttachment = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: "image" | "text" | "file"
  data: string
}

export type AIConversationMessage = {
  role: "user" | "assistant"
  content: string
  attachments?: AIAttachment[]
}

export type AIDocumentToolName =
  | "read_current_document"
  | "read_current_selection"
  | "replace_current_document"
  | "replace_current_selection"

export type AIDocumentToolCall = {
  id: string
  name: AIDocumentToolName
  arguments: Record<string, unknown>
}

export type AIDocumentToolHandler = (call: AIDocumentToolCall) => Promise<unknown>

export type AICompletionOptions = {
  provider: AIProviderConfig
  apiKey?: string
  model: string
  effort: AIEffort
  messages: AIConversationMessage[]
  toolHandler: AIDocumentToolHandler
  signal?: AbortSignal
  fetch?: typeof globalThis.fetch
}

type APIMessage = Record<string, unknown>

type APIError = {
  status: number
  text: string
}

const documentTools = [
  {
    type: "function",
    function: {
      name: "read_current_document",
      description: "Read the current authored HTML document body before answering questions or planning edits.",
      parameters: {type: "object", properties: {}, additionalProperties: false},
    },
  },
  {
    type: "function",
    function: {
      name: "read_current_selection",
      description: "Read the user's current document selection as text and HTML.",
      parameters: {type: "object", properties: {}, additionalProperties: false},
    },
  },
  {
    type: "function",
    function: {
      name: "replace_current_document",
      description: "Propose replacing the current document body with authored HTML. The user must approve before it is applied.",
      parameters: {
        type: "object",
        properties: {
          summary: {type: "string", description: "A short, concrete summary of the proposed change."},
          html: {type: "string", description: "The complete replacement HTML for the document body."},
        },
        required: ["summary", "html"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_current_selection",
      description: "Propose replacing the current selection with authored HTML. The user must approve before it is applied.",
      parameters: {
        type: "object",
        properties: {
          summary: {type: "string", description: "A short, concrete summary of the proposed change."},
          html: {type: "string", description: "Replacement HTML for the current selection."},
        },
        required: ["summary", "html"],
        additionalProperties: false,
      },
    },
  },
] as const

const systemPrompt = `You are WebWriter's document assistant. Use the document tools whenever the request depends on the current document or selection. Read before editing. For changes, call the appropriate replace tool with clean semantic HTML and a concise summary. Preserve content the user did not ask to change. Never claim a change was applied unless the tool result says it was applied.`

const endpoint = (provider: AIProviderConfig, path: string) =>
  `${(provider.inferenceUrl ?? provider.baseUrl).replace(/\/$/, "")}/${path.replace(/^\//, "")}`

const headersFor = (provider: AIProviderConfig, apiKey?: string) => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  }
  if(provider.managed !== "backend" && provider.auth !== "none") {
    if(!apiKey) throw new Error("This provider's API key is locked or missing. Open AI settings to enter or unlock it.")
    if(provider.auth === "bearer") headers.Authorization = `Bearer ${apiKey}`
    else headers[provider.auth] = apiKey
  }
  return headers
}

const safeErrorText = (text: string, apiKey?: string) => {
  const redacted = apiKey ? text.replaceAll(apiKey, "[redacted]") : text
  try {
    const parsed = JSON.parse(redacted) as {error?: {message?: unknown} | string, message?: unknown}
    if(typeof parsed.error === "string") return parsed.error
    if(parsed.error && typeof parsed.error.message === "string") return parsed.error.message
    if(typeof parsed.message === "string") return parsed.message
  }
  catch {
    // The provider returned a non-JSON error body.
  }
  return redacted.trim().slice(0, 500) || "The provider returned an empty error response"
}

const requestJSON = async (
  provider: AIProviderConfig,
  apiKey: string | undefined,
  path: string,
  init: RequestInit,
  fetchImplementation = globalThis.fetch,
) => {
  if(typeof fetchImplementation !== "function") throw new Error("Network requests are unavailable in this browser")
  let response: Response
  try {
    response = await fetchImplementation(endpoint(provider, path), {
      ...init,
      headers: {...headersFor(provider, apiKey), ...(init.headers ?? {})},
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    })
  }
  catch(error) {
    if(error instanceof DOMException && error.name === "AbortError") throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not reach ${provider.name}. Check the endpoint, CORS policy, and network connection. ${message}`)
  }
  const text = await response.text()
  if(!response.ok) {
    throw Object.assign(new Error(safeErrorText(text, apiKey)), {
      status: response.status,
      text,
    } satisfies APIError)
  }
  try {
    return text ? JSON.parse(text) as unknown : {}
  }
  catch {
    throw new Error(`${provider.name} returned invalid JSON`)
  }
}

export async function listAIModels(
  provider: AIProviderConfig,
  apiKey?: string,
  signal?: AbortSignal,
  fetchImplementation?: typeof globalThis.fetch,
) {
  const value = await requestJSON(provider, apiKey, "models", {
    method: "GET",
    signal,
  }, fetchImplementation)
  if(!value || typeof value !== "object" || !Array.isArray((value as {data?: unknown}).data)) {
    throw new Error(`${provider.name} returned an invalid model list`)
  }
  return [...new Set((value as {data: unknown[]}).data.flatMap(model => {
    if(!model || typeof model !== "object" || typeof (model as {id?: unknown}).id !== "string") return []
    return [(model as {id: string}).id]
  }))].sort((left, right) => left.localeCompare(right))
}

const messageContent = (message: AIConversationMessage) => {
  if(message.role === "assistant" || !message.attachments?.length) return message.content
  const parts: Record<string, unknown>[] = [{type: "text", text: message.content}]
  for(const attachment of message.attachments) {
    if(attachment.kind === "image") {
      parts.push({type: "image_url", image_url: {url: attachment.data}})
      continue
    }
    if(attachment.kind === "text") {
      parts.push({
        type: "text",
        text: `\n\n<attachment name=${JSON.stringify(attachment.name)}>\n${attachment.data}\n</attachment>`,
      })
      continue
    }
    parts.push({
      type: "file",
      file: {filename: attachment.name, file_data: attachment.data},
    })
  }
  return parts
}

const contentText = (content: unknown) => {
  if(typeof content === "string") return content
  if(!Array.isArray(content)) return ""
  return content.flatMap(part => {
    if(!part || typeof part !== "object") return []
    const candidate = part as {text?: unknown, content?: unknown}
    if(typeof candidate.text === "string") return [candidate.text]
    if(typeof candidate.content === "string") return [candidate.content]
    return []
  }).join("")
}

const parseToolArguments = (value: unknown) => {
  if(typeof value !== "string") return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {error: "The model returned invalid JSON arguments"}
  }
}

const isDocumentToolName = (value: unknown): value is AIDocumentToolName => [
  "read_current_document",
  "read_current_selection",
  "replace_current_document",
  "replace_current_selection",
].includes(value as AIDocumentToolName)

const toolOutput = (value: unknown) => {
  try {
    return JSON.stringify(value) ?? "null"
  }
  catch {
    return JSON.stringify({status: "error", message: "The tool returned a value that could not be serialized"})
  }
}

const requestCompletion = async (
  options: AICompletionOptions,
  messages: APIMessage[],
  compatibility: {reasoningEffort: boolean},
) => {
  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    tools: documentTools,
    tool_choice: "auto",
  }
  if(compatibility.reasoningEffort) body.reasoning_effort = options.effort

  try {
    return await requestJSON(options.provider, options.apiKey, "chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
      signal: options.signal,
    }, options.fetch)
  }
  catch(error) {
    const apiError = error as Partial<APIError> & Error
    const errorText = `${apiError.message} ${apiError.text ?? ""}`.toLowerCase()
    if(apiError.status === 400 && compatibility.reasoningEffort && errorText.includes("reasoning_effort")) {
      compatibility.reasoningEffort = false
      return requestCompletion(options, messages, compatibility)
    }
    throw error
  }
}

export async function completeAIConversation(options: AICompletionOptions) {
  if(!options.model.trim()) throw new TypeError("Choose an AI model")
  const instructions = options.provider.customInstructions
    ? `${systemPrompt}\n\nProvider-specific instructions:\n${options.provider.customInstructions}`
    : systemPrompt
  const messages: APIMessage[] = [
    {role: "system", content: instructions},
    ...options.messages.map(message => ({
      role: message.role,
      content: messageContent(message),
    })),
  ]
  const compatibility = {reasoningEffort: true}

  for(let round = 0; round < 8; round++) {
    const value = await requestCompletion(options, messages, compatibility)
    const choices = value && typeof value === "object" ? (value as {choices?: unknown}).choices : undefined
    const choice = Array.isArray(choices) ? choices[0] : undefined
    const responseMessage = choice && typeof choice === "object"
      ? (choice as {message?: unknown}).message
      : undefined
    if(!responseMessage || typeof responseMessage !== "object") {
      throw new Error(`${options.provider.name} returned no assistant message`)
    }

    const assistant = responseMessage as {content?: unknown, tool_calls?: unknown}
    const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : []
    if(!calls.length) {
      const content = contentText(assistant.content).trim()
      if(!content) throw new Error(`${options.provider.name} returned an empty response`)
      return content
    }

    messages.push({
      role: "assistant",
      content: assistant.content ?? null,
      tool_calls: calls,
    })
    for(const value of calls) {
      const call = value && typeof value === "object" ? value as {
        id?: unknown
        function?: {name?: unknown, arguments?: unknown}
      } : {}
      const id = typeof call.id === "string" ? call.id : `tool-${round}-${messages.length}`
      const name = call.function?.name
      let result: unknown
      if(!isDocumentToolName(name)) {
        result = {status: "error", message: `Unknown tool: ${String(name)}`}
      }
      else {
        try {
          result = await options.toolHandler({
            id,
            name,
            arguments: parseToolArguments(call.function?.arguments),
          })
        }
        catch(error) {
          result = {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          }
        }
      }
      messages.push({role: "tool", tool_call_id: id, content: toolOutput(result)})
    }
  }

  throw new Error("The model exceeded the document tool-call limit")
}
