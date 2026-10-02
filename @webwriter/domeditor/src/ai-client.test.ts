// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {aiProposalSummary, completeAIConversation, listAIModels, requestsReadOnlyAI} from "./ai-client"
import {aiTools} from "./ai-tools"
import {createAIProvider} from "./ai-provider"

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {"content-type": "application/json"},
})

describe("OpenAI-compatible AI client", () => {
  it.each(["fetch", "body"])("times out a stalled provider %s and aborts its request", async stage => {
    vi.useFakeTimers()
    try {
      const stalled = new Promise<never>(() => {})
      const fetch = vi.fn().mockResolvedValue({ok: true, headers: new Headers(), text: () => stalled})
      if(stage === "fetch") fetch.mockReturnValue(stalled)
      const request = listAIModels(createAIProvider("ollama"), undefined, undefined, fetch)
      const failure = expect(request).rejects.toThrow("did not respond within two minutes")
      await vi.advanceTimersByTimeAsync(120_000)
      await failure
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { vi.useRealTimers() }
  })

  it("bounds a stuck editor context request before contacting the provider", async () => {
    vi.useFakeTimers()
    try {
      const fetch = vi.fn()
      const toolHandler = vi.fn().mockReturnValue(new Promise(() => {}))
      const request = completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], fetch, toolHandler})
      const failure = expect(request).rejects.toThrow("editor did not finish read editor capabilities")
      await vi.advanceTimersByTimeAsync(30_000)
      await failure
      expect(toolHandler.mock.calls[0][1].signal.aborted).toBe(true)
      expect(fetch).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { vi.useRealTimers() }
  })

  it("bounds the entire turn even when individual provider requests keep completing", async () => {
    vi.useFakeTimers()
    try {
      const fetch = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(response({choices: [{message: {content: "Still planning"}}]})), 100_000)))
      const request = completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], fetch,
        toolHandler: vi.fn().mockResolvedValue({})})
      const failure = expect(request).rejects.toThrow("exceeded five minutes")
      await vi.advanceTimersByTimeAsync(300_000)
      await failure
      expect(fetch).toHaveBeenCalledTimes(3)
    }
    finally { vi.useRealTimers() }
  })

  it("stops promptly even when a provider ignores cancellation", async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const request = completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], fetch,
      toolHandler: vi.fn().mockResolvedValue({}), signal: controller.signal})
    const failure = expect(request).rejects.toMatchObject({name: "AbortError"})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    controller.abort()
    await failure
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it("reports each provider step and tool instead of an indefinite working label", async () => {
    const onProgress = vi.fn()
    await completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], readOnly: true,
      fetch: vi.fn().mockResolvedValue(response({choices: [{message: {content: "Done"}}]})), toolHandler: vi.fn().mockResolvedValue({}), onProgress})
    expect(onProgress.mock.calls.map(([message]) => message)).toEqual(["Using read editor capabilities…", "Waiting for test (step 1 of 8)…"])
  })

  it("advertises the original focused tools and prefers available widgets", async () => {
    const fetch = vi.fn().mockResolvedValue(response({choices: [{message: {content: "Done"}}]}))
    await completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "medium", messages: [], readOnly: true,
      fetch, toolHandler: vi.fn().mockResolvedValue({})})
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.stream).toBe(true)
    expect(body.messages[0].content).toContain("Prefer a suitable available widget over a static SVG or image")
    expect(body.messages[0].content).toContain("use an automaton widget for an automaton")
    expect(body.messages[0].content).toContain("Always read the exact package README")
    expect(body.messages[0].content).toContain("inserting an empty widget does not fulfill")
    expect(aiTools.map(tool => tool.function.name)).toEqual([
      "read_editor_capabilities", "read_current_document", "read_current_selection", "inspect_elements", "list_widgets", "read_widget_documentation", "queue_document_change",
    ])
  })

  it.each(["old backend", "unsupported streaming"])("falls back to JSON for %s", async kind => {
    const fetch = vi.fn().mockResolvedValueOnce(kind === "old backend" ? response({controller: {}}) : response({error: {message: "stream is not supported"}}, 400))
      .mockResolvedValueOnce(response({choices: [{message: {content: "Done"}}]}))
    await expect(completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], readOnly: true,
      fetch, toolHandler: vi.fn().mockResolvedValue({})})).resolves.toBe("Done")
    expect(JSON.parse(fetch.mock.calls[0][1].body).stream).toBe(true)
    expect(JSON.parse(fetch.mock.calls[1][1].body).stream).toBe(false)
  })

  it("assembles fragmented streamed tool arguments and preserves private reasoning", async () => {
    const events = [
      ': keep-alive\r\n\r\n',
      'data: ' + JSON.stringify({choices: [{index: 0, delta: {reasoning_content: "Private reasoning"}}]}) + '\n\n',
      'data: ' + JSON.stringify({choices: [{index: 0, delta: {tool_calls: [{index: 0, id: "read-1", function: {name: "read_current_document", arguments: '{"mode":'}}]}}]}) + '\n\n',
      'data: ' + JSON.stringify({choices: [{index: 0, delta: {tool_calls: [{index: 0, function: {arguments: '"html"}'}}]}, finish_reason: "tool_calls"}]}) + '\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const encoded = new TextEncoder().encode(events)
    const stream = new ReadableStream({start(controller) {
      for(let index = 0; index < encoded.length; index += 7) controller.enqueue(encoded.slice(index, index + 7))
      controller.close()
    }})
    const fetch = vi.fn().mockResolvedValueOnce(new Response(stream, {headers: {"Content-Type": "text/event-stream"}}))
      .mockResolvedValueOnce(response({choices: [{message: {content: "Read complete"}}]}))
    const toolHandler = vi.fn().mockResolvedValue({status: "ok", html: "<p>Hello</p>", target: "body"})
    const onProgress = vi.fn()
    await expect(completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], fetch, toolHandler, onProgress, readOnly: true})).resolves.toBe("Read complete")
    expect(toolHandler).toHaveBeenCalledWith(expect.objectContaining({name: "read_current_document", arguments: {mode: "html"}}), expect.anything())
    expect(JSON.parse(fetch.mock.calls[1][1].body).messages).toContainEqual(expect.objectContaining({role: "assistant", reasoning_content: "Private reasoning"}))
    expect(onProgress.mock.calls.flat().join(" ")).not.toContain("Private reasoning")
  })

  it.each(["error", "truncated", "length"])("rejects a %s stream before executing partial tools", async failure => {
    const event = failure === "error" ? {error: {message: "Provider unavailable"}}
      : {choices: [{index: 0, delta: {tool_calls: [{index: 0, id: "edit", function: {name: "queue_document_change", arguments: '{"summary":'}}]}, ...(failure === "length" ? {finish_reason: "length"} : {})}]}
    const fetch = vi.fn().mockResolvedValue(new Response('data: ' + JSON.stringify(event) + '\n\n', {headers: {"Content-Type": "text/event-stream"}}))
    const toolHandler = vi.fn().mockResolvedValue({})
    await expect(completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], fetch, toolHandler})).rejects.toThrow(
      failure === "error" ? "Provider unavailable" : failure === "length" ? "output limit" : "ended before completion")
    expect(toolHandler).toHaveBeenCalledOnce()
  })

  it("times out keep-alive-only streams and releases the reader", async () => {
    vi.useFakeTimers()
    try {
      const cancel = vi.fn()
      const body = new ReadableStream({start(controller) {controller.enqueue(new TextEncoder().encode(': keep-alive\n\n'))}, cancel})
      const onProgress = vi.fn()
      const request = completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [],
        fetch: vi.fn().mockResolvedValue(new Response(body, {headers: {"Content-Type": "text/event-stream"}})),
        toolHandler: vi.fn().mockResolvedValue({}), onProgress})
      const failure = expect(request).rejects.toThrow("did not respond within two minutes")
      await vi.advanceTimersByTimeAsync(120_000)
      await failure
      expect(cancel).toHaveBeenCalledOnce()
      expect(body.locked).toBe(false)
      expect(onProgress.mock.calls.flat()).toContain("test: request accepted, waiting for output (119s; timeout in 1s)…")
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { vi.useRealTimers() }
  })

  it("lists provider models with the configured bearer credential", async () => {
    const provider = createAIProvider("openai")
    const fetch = vi.fn().mockResolvedValue(response({data: [{id: "model-b"}, {id: "model-a"}]}))

    await expect(listAIModels(provider, "test-key", undefined, fetch)).resolves.toEqual(["model-a", "model-b"])
    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({
      headers: expect.objectContaining({Authorization: "Bearer test-key"}),
      credentials: "omit",
      redirect: "error",
    }))
  })

  it("supports API-key header authentication used by compatible gateways", async () => {
    const provider = {...createAIProvider("openai"), auth: "api-key" as const}
    const fetch = vi.fn().mockResolvedValue(response({data: []}))

    await listAIModels(provider, "test-key", undefined, fetch)

    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({
      headers: expect.objectContaining({"api-key": "test-key"}),
    }))
    expect((fetch.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("Authorization")
  })

  it("uses a backend inference URL without exposing the upstream credential", async () => {
    const provider = {
      ...createAIProvider("openai"),
      managed: "backend" as const,
      inferenceUrl: "http://localhost:1234/api/inference/providers/openai",
      credentialStatus: "available" as const,
    }
    const fetch = vi.fn().mockResolvedValue(response({data: []}))

    await listAIModels(provider, undefined, undefined, fetch)

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:1234/api/inference/providers/openai/models",
      expect.objectContaining({headers: expect.not.objectContaining({Authorization: expect.anything()})}),
    )
  })

  it("executes document tool calls and returns their output to the model", async () => {
    const provider = {...createAIProvider("ollama"), models: ["test-model"], defaultModel: "test-model"}
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({choices: [{message: {
        content: null,
        tool_calls: [{id: "call-1", type: "function", function: {name: "read_current_document", arguments: "{}"}}],
      }}]}))
      .mockResolvedValueOnce(response({choices: [{message: {content: "The document has one heading."}}]}))
    const toolHandler = vi.fn().mockResolvedValue({html: "<h1>Hello</h1>"})

    await expect(completeAIConversation({
      provider,
      model: "test-model",
      effort: "medium",
      messages: [{role: "user", content: "What is in this document?"}],
      readOnly: true,
      toolHandler,
      fetch,
    })).resolves.toBe("The document has one heading.")

    expect(toolHandler).toHaveBeenCalledWith(expect.objectContaining({name: "read_current_document"}), {signal: expect.any(AbortSignal)})
    const secondBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string)
    expect(secondBody.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({role: "tool", tool_call_id: "call-1", content: JSON.stringify({html: "<h1>Hello</h1>"})}),
    ]))
    expect(secondBody.messages.find((message: any) => message.role === "assistant")).not.toHaveProperty("reasoning_content")
  })

  it("sends image, text, and binary attachments as compatible content parts", async () => {
    const provider = {...createAIProvider("ollama"), models: ["vision"], defaultModel: "vision"}
    const fetch = vi.fn().mockResolvedValue(response({choices: [{message: {content: "Done"}}]}))

    await completeAIConversation({
      provider,
      model: "vision",
      effort: "low",
      readOnly: true,
      messages: [{
        role: "user",
        content: "Review these",
        attachments: [
          {id: "1", name: "image.png", mimeType: "image/png", size: 4, kind: "image", data: "data:image/png;base64,AQID"},
          {id: "2", name: "notes.txt", mimeType: "text/plain", size: 5, kind: "text", data: "hello"},
          {id: "3", name: "paper.pdf", mimeType: "application/pdf", size: 4, kind: "file", data: "data:application/pdf;base64,AQID"},
        ],
      }],
      toolHandler: vi.fn(),
      fetch,
    })

    const body = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string)
    const content = body.messages[1].content
    expect(content).toEqual(expect.arrayContaining([
      {type: "image_url", image_url: {url: "data:image/png;base64,AQID"}},
      expect.objectContaining({type: "text", text: expect.stringContaining("notes.txt")}),
      {type: "file", file: {filename: "paper.pdf", file_data: "data:application/pdf;base64,AQID"}},
    ]))
  })

  it("sends prefetched capabilities without fabricating an assistant tool call", async () => {
    const fetch = vi.fn().mockResolvedValue(response({choices: [{message: {content: "Ready."}}]}))
    const context = {selection: {kind: "none"}, tools: ["read_current_document"]}
    const toolHandler = vi.fn().mockResolvedValue(context)
    await completeAIConversation({
      provider: createAIProvider("ollama"), model: "deepseek-flash", effort: "medium",
      messages: [{role: "user", content: "Explain only."}], readOnly: true, toolHandler, fetch,
    })

    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.messages.some((message: any) => message.role === "assistant" || message.role === "tool")).toBe(false)
    expect(body.messages).toContainEqual({
      role: "system", content: expect.stringContaining(JSON.stringify(context)),
    })
    expect(toolHandler).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({name: "read_editor_capabilities"}), {signal: expect.any(AbortSignal)})
  })

  it.each(["Inspect the document first.\nThen choose a change.", ""])("preserves reasoning content %j across tool and repair requests", async reasoning => {
    const read = {
      content: null, reasoning_content: reasoning,
      tool_calls: [{id: "read", type: "function", function: {name: "read_current_document", arguments: "{}"}}],
    }
    const repair = {content: "I can add a poem.", reasoning_content: "Use the empty document."}
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({choices: [{message: read}]}))
      .mockResolvedValueOnce(response({choices: [{message: repair}]}))
      .mockResolvedValueOnce(response({choices: [{message: {tool_calls: [{
        id: "edit", type: "function", function: {name: "queue_document_change", arguments: JSON.stringify({
          summary: "Add a poem.", operations: [{type: "replace_document", target: "body", html: "<p>A little poem.</p>"}],
        })},
      }]}}]}))
    const toolHandler = vi.fn(async call => call.name === "queue_document_change"
      ? {status: "queued"} : {target: "body", html: "", truncated: false})

    await expect(completeAIConversation({
      provider: createAIProvider("ollama"), model: "deepseek-flash", effort: "medium",
      messages: [{role: "user", content: "Add a poem."}], toolHandler, fetch,
    })).resolves.toBe("Queued: Add a poem.")

    const secondBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(secondBody.messages).toContainEqual({role: "assistant", ...read})
    const thirdBody = JSON.parse(fetch.mock.calls[2][1].body)
    expect(thirdBody.messages.filter((message: any) => message.role === "assistant")).toEqual([
      {role: "assistant", ...read}, {role: "assistant", ...repair},
    ])
  })

  it("recovers privately from questions and finishes only after an effective proposal", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({choices: [{message: {content: "What style would you like?"}}]}))
      .mockResolvedValueOnce(response({choices: [{message: {tool_calls: [
        {id: "read", function: {name: "read_current_document", arguments: "{}"}},
        {id: "edit", function: {name: "queue_document_change", arguments: JSON.stringify({summary: "Add a heading", operations: [{type: "replace_document", target: "body", html: "<h1>Hello</h1>"}]})}},
      ]}}]}))
    const toolHandler = vi.fn(async call => call.name.startsWith("read_") ? {html: "", target: "body"} : {status: "queued"})
    await expect(completeAIConversation({
      provider: {...createAIProvider("ollama"), customInstructions: ""}, model: "test", effort: "low",
      messages: [{role: "user", content: "Improve this"}], toolHandler, fetch,
    })).resolves.toBe("Queued: Add a heading.")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[1][1].body).messages).toContainEqual(expect.objectContaining({
      role: "system", content: expect.stringContaining("No document change was queued"),
    }))
  })

  it("exposes operation names and fields to providers that render basic object schemas", async () => {
    const fetch = vi.fn().mockResolvedValue(response({choices: [{message: {content: "Plan only."}}]}))
    await completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], fetch, toolHandler: vi.fn()}).catch(() => {})
    const tools = JSON.parse(fetch.mock.calls[0][1].body).tools
    const proposal = tools.find((tool: any) => tool.function.name === "queue_document_change").function
    const item = proposal.parameters.properties.operations.items
    expect(item.type).toBe("object")
    expect(item.properties.type.enum).toContain("insert_html")
    expect(item.properties.type.enum).toContain("replace_document")
    expect(item.properties).toHaveProperty("target")
    expect(item.properties).toHaveProperty("html")
    expect(proposal.description).toContain("insert_html(target, position, html)")
  })

  it.each([
    {type: "replace", target: "body", html: "<h2>Mitosis</h2>"},
    {type: "replace_node", target: "body", content: "<h2>Mitosis</h2>"},
    {type: "prepend_child", target: "body", content: "<h2>Mitosis</h2>"},
    {type: "replace_document", content: "<h2>Mitosis</h2>"},
  ])("repairs the invalid $type operation emitted by the live model", async operation => {
    const tool = (name: string, args: unknown) => response({choices: [{message: {tool_calls: [{id: name, function: {name, arguments: JSON.stringify(args)}}]}}]})
    const fetch = vi.fn()
      .mockResolvedValueOnce(tool("read_current_document", {}))
      .mockResolvedValueOnce(tool("queue_document_change", {summary: "Add a mitosis introduction.", operations: [operation]}))
      .mockImplementationOnce(async (_url, init) => {
        const error = JSON.parse(JSON.parse(init.body).messages.at(-1).content)
        expect(error).toMatchObject({status: "error", message: expect.stringContaining(operation.type === "replace_document" ? "target, html" : "insert_html")})
        return tool("queue_document_change", {summary: "Add a mitosis introduction.", operations: [{type: "insert_html", target: "body", position: "append", html: "<h2>Mitosis</h2>"}]})
      })
    const handler = vi.fn(async call => call.name === "queue_document_change" ? {status: "queued"} : {target: "body", tagName: "body", html: "<p></p>", truncated: false})
    const result = await completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], fetch, toolHandler: handler})
    expect(result).toBe("Queued: Add a mitosis introduction.")
    expect(handler.mock.calls.filter(([call]) => call.name === "queue_document_change")).toHaveLength(1)
  })

  it("reports the underlying tool error when proposal repair is exhausted", async () => {
    const fetch = vi.fn().mockImplementation(async () => response({choices: [{message: {tool_calls: [
      {id: "read", function: {name: "read_current_document", arguments: "{}"}},
      {id: "edit", function: {name: "queue_document_change", arguments: JSON.stringify({summary: "Add an introduction.", operations: [{type: "replace", target: "body", html: "<h2>Mitosis</h2>"}]})}},
    ]}}]}))
    const handler = vi.fn(async call => call.name === "queue_document_change" ? {status: "error", message: "Unsupported document operation"} : {target: "body", html: "", truncated: false})
    await expect(completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], fetch, toolHandler: handler}))
      .rejects.toThrow(/Unsupported operation type.*replace/)
  })

  it("does not count a failed or unread proposal as success", async () => {
    const fetch = vi.fn().mockImplementation(async () => response({choices: [{message: {tool_calls: [
      {id: "edit", function: {name: "queue_document_change", arguments: JSON.stringify({summary: "Add a heading", operations: [{type: "replace_document", target: "body", html: "<h1>Hello</h1>"}]})}},
    ]}}]}))
    const toolHandler = vi.fn()
    await expect(completeAIConversation({
      provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [], toolHandler, fetch,
    })).rejects.toThrow("could not queue")
    expect(toolHandler).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({name: "read_editor_capabilities"}), expect.anything())
    expect(fetch).toHaveBeenCalledTimes(8)
  })

  it("validates concise declarative proposal summaries and explicit read-only requests", () => {
    for(const value of ["", "Which title?", "One. Two. Three.", "- A heading", "I have updated the heading.", "<p>Heading</p>"]) {
      expect(() => aiProposalSummary(value), value).toThrow()
    }
    expect(aiProposalSummary("Add a title. Preserve the introduction.")).toBe("Add a title. Preserve the introduction.")
    expect(requestsReadOnlyAI("What would improve this?")).toBe(false)
    expect(requestsReadOnlyAI("Explain the selection without editing")).toBe(true)
    expect(requestsReadOnlyAI("Do not change the document. Explain the options.")).toBe(true)
    expect(requestsReadOnlyAI("Improve the introduction but don't change the title.")).toBe(false)
    expect(requestsReadOnlyAI("Restyle this without changing the content.")).toBe(false)
  })
})
