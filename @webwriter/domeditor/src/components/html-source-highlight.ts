export type HTMLSourceToken = {text: string, kind: "text" | "tag" | "attribute" | "value" | "comment" | "entity"}

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
