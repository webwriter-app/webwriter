import {describe, expect, it} from "vitest"
import {tokenizeHTMLSource} from "./html-source-highlight"

describe("HTML source highlighting", () => {
  it.each([
    '<my-widget data-label="a > b" disabled><!-- note -->&amp;</my-widget>',
    '<svg:path xmlns:svg="urn:svg" />',
    '<p title="unfinished',
    '<!-- unfinished',
    '<p a=',
    'plain < text\n\t\n',
    '<script>const x = "<p>"</script><style>p > a {color: red}</style>',
    '<textarea><b>literal</b></textarea>',
    '',
  ])("preserves source exactly, including incomplete edits: %s", source => {
    expect(tokenizeHTMLSource(source).map(token => token.text).join("")).toBe(source)
  })

  it("distinguishes tags, attributes, quoted values, comments, and entities", () => {
    const tokens = tokenizeHTMLSource('<my-widget title="a > b" disabled>&amp;<!-- note --></my-widget>')
    expect(tokens).toEqual(expect.arrayContaining([
      {text: "<my-widget", kind: "tag"},
      {text: "title", kind: "attribute"},
      {text: '"a > b"', kind: "value"},
      {text: "disabled", kind: "attribute"},
      {text: "&amp;", kind: "entity"},
      {text: "<!-- note -->", kind: "comment"},
    ]))
  })

  it("leaves markup inside script and style bodies as text", () => {
    expect(tokenizeHTMLSource('<script>"<p>"</script>')).toContainEqual({text: '"<p>"', kind: "text"})
  })
})
