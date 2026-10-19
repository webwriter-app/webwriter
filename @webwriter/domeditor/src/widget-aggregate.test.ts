import {describe, expect, it} from "vitest"
import {
  aggregateDeclarations,
  aggregateContext,
  distanceEmbedding,
  resolveAggregate,
  structuralDistance,
  type WidgetAggregateContext,
  type WidgetDataSnapshot,
} from "./widget-aggregate"

const widget = {id: "quiz", attributes: {answer: "b"}, html: '<demo-quiz answer="b"></demo-quiz>'}
const snapshot = (text: string, mode: WidgetDataSnapshot["mode"] = "individual", scopeId?: string, format: WidgetDataSnapshot["format"] = "json"): WidgetDataSnapshot => ({
  status: "ready", format, mode, ...(scopeId ? {scopeId} : {}), text,
})
const participant = (id: string, data?: WidgetDataSnapshot) => ({id, name: id.toUpperCase(), snapshot: data ? {data} : undefined})
const widgetClass = (declaration: unknown) => class {
  static aggregate = declaration as never
}
const elementWithAggregate = (declaration: unknown) => ({constructor: widgetClass(declaration)}) as unknown as Element

describe("widget aggregate contexts", () => {
  it("parses JSON, leaves XML raw, and groups shared responses by scope", () => {
    const context = aggregateContext(widget, [
      participant("a", snapshot('{"choice":"b"}', "all", "room-all")),
      participant("b", snapshot('{"choice":"b"}', "all", "room-all")),
      participant("c", snapshot('{"choice":"a"}', "group", "group-1")),
      participant("d", snapshot('{"choice":"a"}', "group", "group-1")),
      participant("e", snapshot("<answer>c</answer>", "individual", undefined, "xml")),
    ])

    expect(context.samples.map(sample => [sample.value, sample.learners])).toEqual([
      [{choice: "b"}, ["a", "b"]],
      [{choice: "a"}, ["c", "d"]],
      ["<answer>c</answer>", ["e"]],
    ])
    expect(context.samples[0].data.scopeId).toBe("room-all")
    expect(context.missing).toBe(0)
  })

  it("keeps individual answers independent even when their values are equal", () => {
    const context = aggregateContext(widget, [
      participant("a", snapshot('{"choice":"same"}')),
      participant("b", snapshot('{"choice":"same"}')),
    ])
    expect(context.samples).toHaveLength(2)
    expect(context.samples.map(sample => sample.learners)).toEqual([["a"], ["b"]])
  })

  it("counts unscoped group, pending, error, absent, and malformed snapshots as missing", () => {
    const context = aggregateContext(widget, [
      participant("group", snapshot("{}", "group")),
      participant("pending", {status: "pending", format: "json", mode: "individual"}),
      participant("error", {status: "error", format: "json", mode: "individual", text: "{}"}),
      participant("absent"),
      participant("malformed", snapshot("{")),
      participant("valid", snapshot('{"choice":"a"}')),
    ])
    expect(context.samples.map(sample => sample.learners)).toEqual([["valid"]])
    expect(context.missing).toBe(5)
    expect(context.participants.map(({id}) => id)).toEqual(["group", "pending", "error", "absent", "malformed", "valid"])
  })

  it("deduplicates all-scope responses without a scope ID", () => {
    const context = aggregateContext(widget, [
      participant("a", snapshot('{"choice":"a"}', "all")),
      participant("b", snapshot('{"choice":"b"}', "all")),
    ])
    expect(context.samples).toHaveLength(1)
    expect(context.samples[0].learners).toEqual(["a", "b"])
    expect(context.samples[0].value).toEqual({choice: "b"})
  })

  it("deep-freezes context, participants, sample values, and data snapshots", () => {
    const context = aggregateContext(widget, [participant("a", snapshot('{"choice":"a"}'))])
    expect(Object.isFrozen(context)).toBe(true)
    expect(Object.isFrozen(context.widget.attributes)).toBe(true)
    expect(Object.isFrozen(context.participants[0])).toBe(true)
    expect(Object.isFrozen(context.samples[0])).toBe(true)
    expect(Object.isFrozen(context.samples[0].value)).toBe(true)
    expect(Object.isFrozen(context.samples[0].data)).toBe(true)
    expect(() => (context.samples[0].value as {choice: string}).choice = "b").toThrow()
  })
})

describe("aggregate declarations", () => {
  const context = aggregateContext(widget, [participant("a", snapshot('{"choice":"b"}'))])

  it("resolves a synchronous declaration against current widget attributes and extracts values", () => {
    const element = elementWithAggregate((current: WidgetAggregateContext) => ({
      shape: "selection",
      items: [{id: "a", label: "A"}, {id: "b", label: "B"}],
      value: (data: unknown) => (data as {choice: string}).choice,
      reference: current.widget.attributes.answer,
    }))

    const resolved = resolveAggregate(element, context)!
    expect(resolved.config.shape).toBe("selection")
    expect(resolved.values).toEqual(["b"])
    expect(resolved.context.reference).toBe("b")
    expect(Object.isFrozen(resolved.context)).toBe(true)
  })

  it("omits samples whose extractor returns undefined and adds their learners to missing", () => {
    const unansweredContext = aggregateContext(widget, [
      participant("answered", snapshot('{"choice":"a"}')),
      participant("unanswered", snapshot('{"other":"value"}')),
    ])
    const element = elementWithAggregate({
      shape: "selection",
      items: [{id: "a", label: "A"}],
      value: (data: unknown) => (data as {choice?: string}).choice,
    })

    const resolved = resolveAggregate(element, unansweredContext)!
    expect(resolved.values).toEqual(["a"])
    expect(resolved.context.samples.map(sample => sample.learners)).toEqual([["answered"]])
    expect(resolved.context.missing).toBe(1)
  })

  it("accepts a static declaration and returns null for absent or unknown declarations", () => {
    const element = elementWithAggregate({shape: "text"})
    expect(resolveAggregate(element, context)?.config.shape).toBe("text")

    expect(resolveAggregate(elementWithAggregate(undefined), context)).toBeNull()
    expect(resolveAggregate(elementWithAggregate({shape: "future"}), context)).toBeNull()
  })

  it("rejects malformed item declarations", () => {
    const element = elementWithAggregate({shape: "selection", items: [{id: "a", label: "A"}, {id: "a", label: "Duplicate"}]})
    expect(() => resolveAggregate(element, context)).toThrow(/aggregate items/i)
  })

  it("keeps a legacy single configuration and function declaration selectable by shape ID", () => {
    const element = elementWithAggregate({shape: "text", title: "Written explanation"})
    const declarations = aggregateDeclarations(element, context)
    const resolved = resolveAggregate(element, context, undefined, declarations)!

    expect(declarations).toEqual([{id: "text", title: "Written explanation", config: expect.objectContaining({shape: "text"})}])
    expect(resolved.options).toEqual([{id: "text", title: "Written explanation"}])
    expect(resolved.selectedId).toBe("text")
    expect(resolveAggregate(elementWithAggregate((current: WidgetAggregateContext) => ({shape: "text", title: current.widget.id})), context)?.config.title).toBe("quiz")
  })

  it("evaluates a function returning multiple declarations once and exposes all options", () => {
    let calls = 0
    const element = elementWithAggregate((current: WidgetAggregateContext) => {
      calls++
      return [
        {shape: "text", id: "words"},
        {shape: "number", id: "count", title: "State count"},
      ]
    })
    const declarations = aggregateDeclarations(element, context)
    const resolved = resolveAggregate(element, context, "count", declarations)!

    expect(calls).toBe(1)
    expect(declarations.map(({id, title}) => ({id, title}))).toEqual([
      {id: "words", title: "text"},
      {id: "count", title: "State count"},
    ])
    expect(resolved.config.shape).toBe("number")
    expect(resolved.selectedId).toBe("count")
    expect(resolved.options).toEqual([{id: "words", title: "text"}, {id: "count", title: "State count"}])
  })

  it("defaults to the first declaration and falls back for an unknown requested ID", () => {
    const element = elementWithAggregate([
      {shape: "text", id: "text"},
      {shape: "number", id: "count"},
    ])
    expect(resolveAggregate(element, context)?.selectedId).toBe("text")
    expect(resolveAggregate(element, context, "missing")?.selectedId).toBe("text")
  })

  it("filters unsupported shapes without hiding supported choices, and returns null for only unknown shapes", () => {
    const element = elementWithAggregate([
      {shape: "future"},
      {shape: "text", id: "copy"},
      {shape: "number", id: "count"},
    ])
    expect(aggregateDeclarations(element, context).map(({id}) => id)).toEqual(["copy", "count"])
    expect(resolveAggregate(element, context, "count")?.config.shape).toBe("number")
    expect(resolveAggregate(elementWithAggregate({shape: "future"}), context)).toBeNull()
    expect(resolveAggregate(elementWithAggregate([]), context)).toBeNull()
  })

  it("rejects duplicate IDs, repeated implicit shapes, malformed IDs, and lists over 50", () => {
    expect(() => aggregateDeclarations(elementWithAggregate([
      {shape: "text", id: "same"},
      {shape: "number", id: "same"},
    ]), context)).toThrow(/duplicate aggregate declaration id/i)
    expect(() => aggregateDeclarations(elementWithAggregate([{shape: "text"}, {shape: "text"}]), context)).toThrow(/duplicate aggregate declaration id/i)
    for(const id of ["", "   ", "x".repeat(129), 42]) {
      expect(() => aggregateDeclarations(elementWithAggregate({shape: "text", id}), context)).toThrow(/aggregate declaration id/i)
    }
    expect(() => aggregateDeclarations(elementWithAggregate(Array.from({length: 51}, (_, index) => ({shape: "text", id: `view-${index}`}))), context)).toThrow(/maximum is 50/i)
  })

  it("does not mutate frozen context or extractor inputs while evaluating a selection", () => {
    const current = aggregateContext(widget, [participant("a", snapshot('{"choice":"b"}'))])
    const originalSamples = current.samples
    const element = elementWithAggregate({
      shape: "text",
      value: (data: unknown) => (data as {choice: string}).choice,
    })
    const resolved = resolveAggregate(element, current)!

    expect(current.samples).toBe(originalSamples)
    expect(Object.isFrozen(current)).toBe(true)
    expect(resolved.values).toEqual(["b"])
  })
})

describe("aggregate distances", () => {
  it("computes structural distance without treating object key order as meaning", () => {
    expect(structuralDistance({a: 1, b: {c: true}}, {b: {c: true}, a: 1})).toBe(0)
    expect(structuralDistance({a: 1, b: 2}, {a: 1, b: 3})).toBe(0.5)
    expect(structuralDistance(null, null)).toBe(0)
  })

  it("embeds distances into finite coordinates while preserving pairwise distances", () => {
    const distances = [[0, 1, 3], [1, 0, 2], [3, 2, 0]]
    const points = distanceEmbedding(distances)
    expect(points).toHaveLength(3)
    expect(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    for(let i = 0; i < points.length; i++) for(let j = i + 1; j < points.length; j++) {
      expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeCloseTo(distances[i][j], 4)
    }
  })

  it.each([
    {matrix: [[]]},
    {matrix: [[0, 1], [2, 0]]},
    {matrix: [[1]]},
    {matrix: [[0, -1], [-1, 0]]},
  ])("rejects invalid distance matrices: %j", ({matrix}: {matrix: number[][]}) => {
    expect(() => distanceEmbedding(matrix)).toThrow()
  })
})
