// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {completeAIConversation, listAIModels} from "./ai-client"
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
      toolHandler,
      fetch,
    })).resolves.toBe("The document has one heading.")

    expect(toolHandler).toHaveBeenCalledWith(expect.objectContaining({name: "read_current_document"}))
    const secondBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string)
    expect(secondBody.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({role: "tool", tool_call_id: "call-1", content: JSON.stringify({html: "<h1>Hello</h1>"})}),
    ]))
  })

  it("sends image, text, and binary attachments as compatible content parts", async () => {
    const provider = {...createAIProvider("ollama"), models: ["vision"], defaultModel: "vision"}
    const fetch = vi.fn().mockResolvedValue(response({choices: [{message: {content: "Done"}}]}))

    await completeAIConversation({
      provider,
      model: "vision",
      effort: "low",
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
})
