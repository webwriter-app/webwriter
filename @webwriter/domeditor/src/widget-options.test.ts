import {describe, expect, it} from "vitest"
import {
  formatWidgetDuration,
  isWidgetOptionsState,
  parseWidgetDuration,
  widgetActionState,
  widgetOptionGroupState,
  widgetOptionState,
} from "./widget-options"

const baseState = () => ({
  path: [0, 1],
  localName: "x-control",
  options: [widgetOptionState("amount", {type: Number}, 2, "en")],
  actions: [widgetActionState("reset", {}, "en")],
})

describe("widget option metadata", () => {
  it("normalizes groups, control hints, availability, units, and action metadata", () => {
    const option = widgetOptionState("amount", {
      type: Number,
      group: "layout",
      control: "range",
      unit: "px",
      steps: [5, 1, 3, 3, Number.NaN, Infinity, "2"],
      hidden: true,
      disabled: true,
      readOnly: false,
      disabledReason: {en: "Unavailable", de: "Nicht verfügbar"},
    }, 3, "en")
    const group = widgetOptionGroupState("layout", {
      label: {en: "Layout", de: "Anordnung"},
      description: {en: "Position and size", de: "Position und Größe"},
      collapsible: true,
      collapsed: false,
      advanced: true,
    }, "en")
    const action = widgetActionState("delete", {
      group: "danger-zone",
      icon: "trash",
      intent: "danger",
      confirm: {en: "Delete this item?", de: "Dieses Element löschen?"},
      hidden: true,
      disabled: true,
      disabledReason: {en: "Locked", de: "Gesperrt"},
    }, "en")

    expect(option).toMatchObject({
      group: "layout",
      control: "range",
      unit: "px",
      steps: [1, 3, 5],
      hidden: true,
      disabled: true,
      disabledReason: "Unavailable",
    })
    expect(option).not.toHaveProperty("readOnly")
    expect(group).toEqual({
      name: "layout",
      label: "Layout",
      description: "Position and size",
      collapsible: true,
      advanced: true,
    })
    expect(action).toMatchObject({
      group: "danger-zone",
      icon: "trash",
      intent: "danger",
      confirm: "Delete this item?",
      hidden: true,
      disabled: true,
      disabledReason: "Locked",
    })
    expect(action).not.toHaveProperty("busy")
    expect(action).not.toHaveProperty("error")
  })

  it("keeps only controls compatible with the declared option type", () => {
    expect(widgetOptionState("count", {type: "number", control: "range"}, 1, "en").control).toBe("range")
    expect(widgetOptionState("count", {type: "number", control: "input"}, 1, "en").control).toBe("input")
    expect(widgetOptionState("enabled", {type: Boolean, control: "switch"}, true, "en").control).toBe("switch")
    expect(widgetOptionState("enabled", {type: Boolean, control: "checkbox"}, true, "en").control).toBe("checkbox")
    expect(widgetOptionState("choice", {type: "select", control: "select"}, "a", "en").control).toBe("select")
    expect(widgetOptionState("choice", {type: "select", control: "radio", multiple: true}, ["a"], "en").control).toBeUndefined()
    expect(widgetOptionState("choice", {type: "select", control: "segmented"}, "a", "en").control).toBe("segmented")

    expect(widgetOptionState("text", {type: String, control: "range"}, "x", "en")).not.toHaveProperty("control")
    expect(widgetOptionState("count", {type: Number, control: "switch"}, 1, "en")).not.toHaveProperty("control")
    expect(widgetOptionState("enabled", {type: Boolean, control: "select"}, true, "en")).not.toHaveProperty("control")
    expect(widgetOptionState("choice", {type: "select", control: "radio", multiple: true}, ["a"], "en")).not.toHaveProperty("control")
  })

  it("normalizes duration controls and recursive tree choices", () => {
    const duration = widgetOptionState("timeout", {type: Number, control: "duration"}, 65.25, "en")
    expect(duration.control).toBe("duration")

    const tree = widgetOptionState("location", {
      type: "select",
      multiple: true,
      control: "tree",
      options: [
        {label: {en: "Europe"}, children: [
          {value: "de", label: {en: "Germany"}, description: {en: "Central Europe"}},
          {value: "fr", label: {en: "France"}},
        ]},
        {value: "de", label: "Duplicate Germany"},
      ],
    }, ["de"], "en")

    expect(tree).toMatchObject({
      multiple: true,
      control: "tree",
      tree: [{
        label: "Europe",
        children: [
          {value: "de", label: "Germany", description: "Central Europe"},
          {value: "fr", label: "France"},
        ],
      }],
      choices: [
        {value: "de", label: "Germany", description: "Central Europe"},
        {value: "fr", label: "France"},
      ],
    })
  })

  it("normalizes reference and file action metadata only for supported shapes", () => {
    expect(widgetOptionState("target", {
      type: "reference", selector: "article, section", excludeSelf: true,
    }, "#intro", "en")).toMatchObject({
      type: "reference", selector: "article, section", excludeSelf: true,
    })
    expect(widgetOptionState("target", {type: "reference", selector: 3, excludeSelf: "yes"}, "", "en"))
      .not.toHaveProperty("selector")
    expect(widgetOptionState("target", {type: "reference", selector: 3, excludeSelf: "yes"}, "", "en"))
      .not.toHaveProperty("excludeSelf")
    expect(widgetOptionState("target", {type: "reference", excludeSelf: false}, "", "en").excludeSelf).toBe(false)
    expect(widgetOptionState("choice", {type: "select", multiple: false}, "a", "en")).not.toHaveProperty("multiple")

    expect(widgetActionState("upload", {
      input: {type: "file", accept: "image/*,.pdf", multiple: true},
    }, "en")).toMatchObject({input: {type: "file", accept: "image/*,.pdf", multiple: true}})
    expect(widgetActionState("upload", {input: {type: "file", accept: 4, multiple: "yes"}}, "en"))
      .toMatchObject({input: {type: "file"}})
    expect(widgetActionState("refresh", {input: {type: "text", accept: "image/*"}}, "en"))
      .not.toHaveProperty("input")
  })

  it("formats and parses supported duration forms", () => {
    expect(formatWidgetDuration(0)).toBe("0:00")
    expect(formatWidgetDuration(65.25)).toBe("1:05.25")
    expect(formatWidgetDuration(3661)).toBe("1:01:01")
    expect(formatWidgetDuration(25 * 60 * 60)).toBe("25:00:00")
    expect(parseWidgetDuration("42")).toBe(42)
    expect(parseWidgetDuration("12.5")).toBe(12.5)
    expect(parseWidgetDuration("1:05.25")).toBe(65.25)
    expect(parseWidgetDuration("1:01:01")).toBe(3661)
    expect(parseWidgetDuration("25:00:00")).toBe(25 * 60 * 60)
    expect(parseWidgetDuration("   ")).toBeUndefined()
  })

  it("preserves legacy option and action declarations without adding metadata", () => {
    expect(widgetOptionState("title", {type: String, label: "Title"}, "Hello", "en")).toEqual({
      name: "title", type: "string", label: "Title", attribute: "title", value: "Hello",
    })
    expect(widgetActionState("refresh", {}, "en")).toEqual({name: "refresh", label: "Refresh"})
    expect(widgetOptionGroupState("main", {label: "Main"}, "en")).toEqual({name: "main", label: "Main"})

    expect(isWidgetOptionsState({
      path: [], localName: "x-control",
      options: [{name: "title", type: "string", label: "Title", attribute: "title", value: "Hello"}],
      actions: [{name: "refresh", label: "Refresh"}],
    })).toBe(true)
  })
})

describe("widget options bridge validation", () => {
  it("accepts normalized metadata and localized choice descriptions", () => {
    const state = baseState()
    state.options[0] = {
      ...widgetOptionState("mode", {
        type: "select", control: "radio", group: "general", unit: "level", steps: [0, 1],
        hidden: false, disabled: true, disabledReason: {en: "Read only"},
        options: [{value: "a", label: {en: "Alpha"}, description: {en: "First option"}}],
      }, "a", "en"),
    }
    const normalized = {
      ...state,
      groups: [widgetOptionGroupState("general", {label: "General", collapsible: true, collapsed: true, advanced: false}, "en")],
      options: [{...state.options[0], choices: [{value: "a", label: "Alpha", description: "First option"}]}],
      actions: [{
        ...state.actions[0], group: "general", icon: "refresh", intent: "default" as const,
        confirm: "Proceed?", hidden: false, disabled: true, disabledReason: "Busy",
      }],
    }
    expect(isWidgetOptionsState(normalized)).toBe(true)
  })

  it.each([
    ["group", {group: 42}],
    ["control", {control: "slider"}],
    ["unit", {unit: {en: "px"}}],
    ["steps", {steps: [1, "2"]}],
    ["hidden", {hidden: "yes"}],
    ["disabled", {disabled: 1}],
    ["readOnly", {readOnly: null}],
    ["disabledReason", {disabledReason: {en: 4}}],
  ])("rejects malformed option metadata (%s)", (_field, metadata) => {
    expect(isWidgetOptionsState({
      ...baseState(),
      options: [{...baseState().options[0], ...metadata}],
    })).toBe(false)
  })

  it.each([
    ["group name", {name: 1, label: "General"}],
    ["group label", {name: "general", label: false}],
    ["group description", {name: "general", label: "General", description: 1}],
    ["group collapsible", {name: "general", label: "General", collapsible: "true"}],
    ["group collapsed", {name: "general", label: "General", collapsed: 1}],
    ["group advanced", {name: "general", label: "General", advanced: null}],
  ])("rejects malformed %s metadata", (_field, group) => {
    expect(isWidgetOptionsState({...baseState(), groups: [group]})).toBe(false)
  })

  it.each([
    ["action group", {group: false}],
    ["action icon", {icon: 3}],
    ["action intent", {intent: "warning"}],
    ["action confirm", {confirm: {en: 5}}],
    ["action hidden", {hidden: "false"}],
    ["action disabled", {disabled: 1}],
    ["action disabledReason", {disabledReason: false}],
    ["action busy", {busy: "true"}],
    ["action error", {error: {message: "bad"}}],
  ])("rejects malformed %s metadata", (_field, metadata) => {
    expect(isWidgetOptionsState({
      ...baseState(),
      actions: [{...baseState().actions[0], ...metadata}],
    })).toBe(false)
  })

  it("rejects malformed choice descriptions while accepting legacy choices", () => {
    const option = {...baseState().options[0], type: "select", choices: [{value: "a", label: "Alpha"}]}
    expect(isWidgetOptionsState({...baseState(), options: [option]})).toBe(true)
    expect(isWidgetOptionsState({...baseState(), options: [{...option, choices: [{value: "a", label: "Alpha", description: 3}]}]})).toBe(false)
  })

  it("accepts normalized duration, tree, reference, and file action metadata", () => {
    const options = baseState()
    options.options = [
      {name: "timeout", type: "number", label: "Timeout", attribute: "timeout", value: 12,
        control: "duration"},
      {name: "location", type: "select", label: "Location", attribute: "location", value: ["de"],
        multiple: true, control: "tree",
        tree: [{label: "Europe", children: [{value: "de", label: "Germany"}]}],
        choices: [{value: "de", label: "Germany"}]},
      {name: "target", type: "reference", label: "Target", attribute: "target", value: "intro",
        selector: "article", excludeSelf: true},
    ]
    options.actions = [{name: "upload", label: "Upload", input: {type: "file", accept: "image/*", multiple: true}}]
    expect(isWidgetOptionsState(options)).toBe(true)
  })

  it.each([
    ["duration control on non-number", {type: "string", control: "duration"}],
    ["tree control without multiple select", {type: "select", control: "tree"}],
    ["tree node without a value or children", {type: "select", multiple: true, control: "tree", tree: [{label: "Broken"}]}],
    ["non-finite tree leaf value", {type: "select", multiple: true, control: "tree", tree: [{value: 3, label: "Broken"}]}],
    ["malformed reference selector", {type: "reference", selector: false}],
    ["malformed reference excludeSelf", {type: "reference", excludeSelf: "yes"}],
  ])("rejects malformed new option metadata (%s)", (_field, metadata) => {
    expect(isWidgetOptionsState({
      ...baseState(),
      options: [{...baseState().options[0], ...metadata}],
    })).toBe(false)
  })

  it.each([
    ["non-file action input", {input: {type: "other", accept: "image/*"}}],
    ["non-string accept", {input: {type: "file", accept: 5}}],
    ["non-boolean multiple", {input: {type: "file", multiple: "yes"}}],
  ])("rejects malformed file action metadata (%s)", (_field, metadata) => {
    expect(isWidgetOptionsState({
      ...baseState(),
      actions: [{...baseState().actions[0], ...metadata}],
    })).toBe(false)
  })

  it("rejects invalid durations and malformed, cyclic, or oversized trees", () => {
    for(const value of ["-1", "NaN", "Infinity", "1:60", "1:02:60", "1:02:03:04", "1:02."]) {
      expect(parseWidgetDuration(value)).toBeUndefined()
    }
    for(const value of [-1, Number.NaN, Infinity]) {
      expect(formatWidgetDuration(value)).toBe("")
    }

    const cyclic: Record<string, unknown> = {label: "Cycle", children: []}
    ;(cyclic.children as unknown[]).push(cyclic)
    const normalizedCycle = widgetOptionState("tree", {
      type: "select", multiple: true, control: "tree", options: [cyclic],
    }, [], "en")
    expect(() => JSON.stringify(normalizedCycle)).not.toThrow()
    expect(isWidgetOptionsState({
      ...baseState(), options: [{...baseState().options[0], type: "select", multiple: true,
        control: "tree", tree: [cyclic]}],
    })).toBe(false)
    expect(isWidgetOptionsState({
      ...baseState(), options: [{...baseState().options[0], type: "select", multiple: true,
        control: "tree", tree: [{value: "a", label: "A", children: []}]}],
    })).toBe(false)
    expect(isWidgetOptionsState({
      ...baseState(), options: [{...baseState().options[0], type: "select", multiple: true,
        control: "tree", tree: Array.from({length: 1001}, (_, index) => ({value: String(index), label: `Item ${index}`}))}],
    })).toBe(false)
  })
})
