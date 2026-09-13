// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {aiProposalSummary, completeAIConversation, listAIModels, requestsReadOnlyAI} from "./ai-client"
import {createAIProvider} from "./ai-provider"

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {"content-type": "application/json"},
})

describe("OpenAI-compatible AI client", () => {
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

    expect(toolHandler).toHaveBeenCalledWith(expect.objectContaining({name: "read_current_document"}), {signal: undefined})
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
    expect(toolHandler).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({name: "read_editor_capabilities"}), {signal: undefined})
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
