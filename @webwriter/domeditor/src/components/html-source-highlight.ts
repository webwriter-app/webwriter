import {baseSchema} from "../baseschema"

export type HTMLSourceToken = {text: string, kind: "text" | "tag" | "attribute" | "value" | "comment" | "entity"}

const phrasingTags = new Set(Object.entries(baseSchema)
  .filter(([, rule]) => "group" in rule && rule.group.some(group => group === "phrasing"))
  .map(([name]) => name))
const voidTags = new Set("area base br col embed hr img input link meta param source track wbr".split(" "))

/** Format only structural whitespace, retaining literal tag spelling and inline runs.
 * Run when loading source, never while typing. No DOM parsing/normalization is involved.
 */
export function indentHTMLSource(source: string): string {
  const tokens = tokenizeHTMLSource(source)
  let index = 0
  let valid = true
  const children = (parent: string, depth: number, preserve: boolean): {text: string, closing: string} => {
    const parts: {text: string, block: boolean}[] = []
    let closing = ""
    while(index < tokens.length) {
      const token = tokens[index++]
      const tag = token.kind === "tag" && /^<(\/?)([^\s/>]+)/.exec(token.text)
      if(!tag) {
        parts.push({text: token.text, block: token.kind === "comment"})
        continue
      }
      let opening = token.text
      let end = ""
      while(index < tokens.length) {
        const part = tokens[index++]
        opening += part.text
        if(part.kind === "tag" && /^\/?>$/.test(part.text)) {
          end = part.text
          break
        }
      }
      if(!end) valid = false
      const name = tag[2].toLowerCase()
      if(tag[1]) {
        if(name !== parent) valid = false
        closing = opening
        break
      }
      const block = !phrasingTags.has(name)
      const literal = preserve || !block || name.includes("-") || /^(pre|script|style|textarea|title|svg|math)$/.test(name)
      if(!voidTags.has(name) && end !== "/>") {
        const content = children(name, depth + (block ? 1 : 0), literal)
        opening += content.text + content.closing
        if(!content.closing) valid = false
      }
      parts.push({text: opening, block})
    }
    const structural = !preserve && parts.some(part => part.block)
      && parts.every(part => part.block || /^[\t\n\f\r ]*$/.test(part.text))
    const text = structural
      ? parts.filter(part => part.block).map(part => `${"  ".repeat(depth)}${part.text}`).join("\n")
      : parts.map(part => part.text).join("")
    return {
      text: structural && parent ? `\n${text}\n${"  ".repeat(Math.max(0, depth - 1))}` : text,
      closing,
    }
  }
  const result = children("", 0, false)
  return valid && index === tokens.length && !result.closing ? result.text : source
}

/** A forgiving source lexer, not an HTML parser: never repair or execute input. */
export function tokenizeHTMLSource(source: string): HTMLSourceToken[] {
  const tokens: HTMLSourceToken[] = []
  const pattern = /<!--[\s\S]*?(?:-->|$)|<![^>]*(?:>|$)|<\/?[a-zA-Z][^\s/>]*|&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][\da-zA-Z]*);?/g
  let offset = 0
  let match: RegExpExecArray | null
  const add = (text: string, kind: HTMLSourceToken["kind"]) => {
    if(text) tokens.push({text, kind})
  }
  while((match = pattern.exec(source))) {
    add(source.slice(offset, match.index), "text")
    const opening = match[0]
    if(opening.startsWith("<!")) add(opening, "comment")
    else if(opening.startsWith("&")) add(opening, "entity")
    else {
      add(opening, "tag")
      // Sticky matching keeps quoted > and < characters inside attribute values.
      const attribute = /\s+|\/?>|=|"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s=<>`"']+|[\s\S]/y
      attribute.lastIndex = pattern.lastIndex
      let value = false
      let closed = false
      let part: RegExpExecArray | null
      while((part = attribute.exec(source))) {
        const text = part[0]
        if(/^\/?>$/.test(text)) {
          add(text, "tag")
          closed = true
          break
        }
        const whitespace = /^\s+$/.test(text)
        add(text, whitespace ? "text" : text === "=" ? "tag" : value || /^["']/.test(text) ? "value" : "attribute")
        if(!whitespace) value = text === "="
      }
      pattern.lastIndex = part ? attribute.lastIndex : source.length
      // HTML raw-text elements may contain things that only look like markup.
      const name = opening.slice(1).toLowerCase()
      if(closed && /^(script|style|textarea|title)$/.test(name)) {
        const end = new RegExp(`</${name}(?=[\\s/>])`, "ig")
        end.lastIndex = pattern.lastIndex
        const closing = end.exec(source)
        const until = closing?.index ?? source.length
        add(source.slice(pattern.lastIndex, until), "text")
        pattern.lastIndex = until
      }
    }
    offset = pattern.lastIndex
  }
  add(source.slice(offset), "text")
  return tokens
}
