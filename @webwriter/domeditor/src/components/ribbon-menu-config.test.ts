import {describe, expect, it} from "vitest"
import {contextDrawerPolicy} from "./ribbon-menu-config"

const labels = (surface: "ribbon" | "toolbox", context: Record<string, boolean> = {}) =>
  contextDrawerPolicy({menu: "Edit", surface, ...(surface === "toolbox" ? {activeTool: "Edit" as const} : {}), ...context}).map(group => group.label)

describe("context drawer policy", () => {
  it("keeps paragraph and section contexts ahead of overlapping contexts", () => {
    expect(labels("ribbon", {paragraphSelected: true, media: true})).toEqual(["Media"])
    expect(labels("toolbox", {sectionSelected: true, headingGroup: true, table: true})).toEqual(["Section"])
  })

  it("keeps specialized media, dialog, table, list, and disclosure drawers distinct", () => {
    expect(labels("ribbon", {media: true, dialog: true})).toEqual(["Media"])
    expect(labels("toolbox", {dialog: true, table: true})).toEqual(["Layout"])
    expect(labels("toolbox", {table: true})).toEqual(["Layout"])
    expect(labels("ribbon", {orderedList: true, disclosure: true})).toEqual(["List"])
    expect(labels("toolbox", {disclosure: true})).toEqual([])
  })

  it("retains media controls for a figure selected through the media context", () => {
    expect(labels("ribbon", {media: true, figure: true})).toEqual(["Media"])
    expect(labels("toolbox", {media: true, figure: true})).toEqual(["Media"])
  })

  it("has no generic Attributes drawer", () => {
    expect(labels("toolbox")).toEqual([])
    expect(labels("ribbon")).not.toContain("Attributes")
  })

  it("keeps Comments in Review while Versions use the bottom pane", () => {
    expect(contextDrawerPolicy({menu: "Edit", surface: "toolbox", activeTool: "Review"}).map(group => group.label))
      .toEqual(["Comments"])
  })

  it("shows widget options without a separate Attributes drawer", () => {
    expect(labels("toolbox", {widget: true})).toEqual(["Widget"])
    expect(labels("ribbon", {widget: true, media: true})).toEqual(["Widget"])
    expect(labels("toolbox", {paragraphSelected: true, widget: true})).toEqual(["Widget"])
  })
})
