import {describe, expect, it} from "vitest"
import {indentHTMLSource, tokenizeHTMLSource} from "./html-source-highlight"

describe("HTML source indentation", () => {
  it("indents nested tags by two spaces and keeps text and phrasing inline", () => {
    expect(indentHTMLSource('<section><div><p>Hello <strong>bold <em>text</em></strong>!</p><p>Next<br>line</p></div></section>'))
      .toBe('<section>\n  <div>\n    <p>Hello <strong>bold <em>text</em></strong>!</p>\n    <p>Next<br>line</p>\n  </div>\n</section>')
  })

  it("formats multiple roots, comments, and void tags without rewriting attributes", () => {
    expect(indentHTMLSource('<DIV title=\'a > b\'><hr><!-- note --><p>&amp;</p></DIV><p>End</p>'))
      .toBe('<DIV title=\'a > b\'>\n  <hr>\n  <!-- note -->\n  <p>&amp;</p>\n</DIV>\n<p>End</p>')
  })

  it("reindents existing structural whitespace idempotently", () => {
    const result = indentHTMLSource('<ul>\n<li>One</li>  <li>Two</li>\n</ul>')
    expect(result).toBe('<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>')
    expect(indentHTMLSource(result)).toBe(result)
  })

  it.each([
    '<p> Text <span>with <b>nested</b> phrasing</span> and spaces </p>',
    '<div>before<p>block</p>after</div>',
    '<pre>  <b>text</b>\n <i>more</i></pre>',
    '<script>const html = "<p>text</p>";</script>',
    '<style>p > a { color: red }</style>',
    '<textarea>  text\n</textarea>',
    '<my-widget><div><p>  content </p></div></my-widget>',
    '<svg><text> a </text><path d="M0 0"/></svg>',
    '<p title="unfinished',
    '<section><p>unfinished',
    '<div><p>mismatched</div>',
    'plain text',
    '',
  ])("preserves inline, literal, or incomplete source: %s", source => {
    expect(indentHTMLSource(source)).toBe(source)
  })
})

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
