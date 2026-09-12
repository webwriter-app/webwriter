import {describe, expect, it} from "vitest"
import {contextDrawerPolicy} from "./ribbon-menu-config"

const labels = (surface: "ribbon" | "toolbox", context: Record<string, boolean> = {}) =>
  contextDrawerPolicy({menu: "Edit", surface, ...(surface === "toolbox" ? {activeTool: "Edit" as const} : {}), ...context}).map(group => group.label)

describe("context drawer policy", () => {
  it("keeps paragraph and section contexts ahead of overlapping contexts", () => {
    expect(labels("ribbon", {paragraphSelected: true, media: true})).toEqual(["Paragraph", "Attributes"])
    expect(labels("toolbox", {sectionSelected: true, headingGroup: true, table: true})).toEqual(["Section"])
  })

  it("keeps specialized media, dialog, table, list, and disclosure drawers distinct", () => {
    expect(labels("ribbon", {media: true, dialog: true})).toEqual(["Media"])
    expect(labels("toolbox", {dialog: true, table: true})).toEqual(["Layout"])
    expect(labels("toolbox", {table: true})).toEqual(["Layout"])
    expect(labels("ribbon", {orderedList: true, disclosure: true})).toEqual(["List"])
    expect(labels("toolbox", {disclosure: true})).toEqual(["Disclosure", "Attributes"])
  })

  it("retains media controls for a figure selected through the media context", () => {
    expect(labels("ribbon", {media: true, figure: true})).toEqual(["Media"])
    expect(labels("toolbox", {media: true, figure: true})).toEqual(["Media"])
  })

  it("keeps Attributes as the toolbox fallback while ribbon retains its edit groups", () => {
    expect(labels("toolbox")).toEqual(["Attributes"])
    expect(labels("toolbox", {attributes: true})).toEqual(["Attributes"])
    expect(labels("ribbon", {attributes: true})).toEqual(["Attributes"])
  })
})
