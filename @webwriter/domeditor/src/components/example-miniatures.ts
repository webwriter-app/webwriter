import {css, html, nothing, svg, type TemplateResult} from "lit"

const phrasingTags = new Set(["b", "strong", "i", "em", "u", "s", "sub", "sup", "small", "mark", "span", "br"])
const droppedTags = new Set(["script", "style", "template", "noscript", "textarea", "select", "button", "iframe", "object"])
const normalize = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim()
const blockTags = new Set(["p", "div", "li", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "figcaption", "summary"])

/** Text as read, so line breaks and block boundaries keep words apart. */
function readableText(element: Element | undefined) {
  if(!element) return ""
  let text = ""
  const walk = (node: Node) => {
    for(const child of node.childNodes) {
      if(child.nodeType === Node.TEXT_NODE) text += child.textContent
      else if(child.nodeType !== Node.ELEMENT_NODE || droppedTags.has((child as Element).localName)) continue
      else if((child as Element).localName === "br") text += " "
      else { walk(child); if(blockTags.has((child as Element).localName)) text += " " }
    }
  }
  walk(element)
  return normalize(text)
}

/** Reads the excerpts a miniature shows from the loaded example and records selectors that no longer match. */
export class Excerpt {
  constructor(readonly source: Document, private root: ParentNode = source, readonly missing: string[] = []) {}
  get lang() { return this.source.documentElement.lang || "en" }

  element(selector: string, index = 0) {
    const element = this.root.querySelectorAll(selector)[index]
    if(!element) this.missing.push(`${selector} [${index}]`)
    return element
  }
  all(selector: string) {
    const elements = [...this.root.querySelectorAll(selector)]
    if(!elements.length) this.missing.push(selector)
    return elements
  }
  scope(selector: string, index = 0) {
    return new Excerpt(this.source, this.element(selector, index) ?? this.source.createDocumentFragment(), this.missing)
  }
  text(selector: string, index = 0) { return readableText(this.element(selector, index)) }
  texts(selector: string) { return this.all(selector).map(readableText).filter(Boolean) }
  src(selector: string, index = 0) { return this.element(selector, index)?.getAttribute("src") ?? "" }
  data<T>(selector: string, index = 0): T | undefined {
    try { return JSON.parse(this.element(selector, index)?.textContent ?? "") as T }
    catch { this.missing.push(`${selector} [${index}] as JSON`) }
  }
  /** Inline formatting, line breaks, and formulas of an authored block; only the listed style properties survive. */
  rich(selector: string, index = 0, keep: string[] = []) {
    const element = this.element(selector, index)
    if(!element) return nothing
    if(element.localName === "math") return cleanMath(element)
    const fragment = copyPhrasing(element, keep)
    trimBreaks(fragment)
    return fragment
  }
}

function copyPhrasing(element: Element, keep: string[]) {
  const fragment = document.createDocumentFragment()
  for(const child of element.childNodes) {
    if(child.nodeType === Node.TEXT_NODE) fragment.append(child.textContent ?? "")
    if(child.nodeType !== Node.ELEMENT_NODE) continue
    const source = child as HTMLElement
    if(droppedTags.has(source.localName)) continue
    if(source.localName === "math") fragment.append(cleanMath(source))
    else if(phrasingTags.has(source.localName)) {
      const copy = document.createElement(source.localName)
      for(const property of keep) {
        const value = source.style?.getPropertyValue(property)
        if(value) copy.style.setProperty(property, value)
      }
      copy.append(copyPhrasing(source, keep))
      fragment.append(copy)
    }
    else fragment.append(copyPhrasing(source, keep))
  }
  return fragment
}

function cleanMath(math: Element) {
  const copy = document.importNode(math, true)
  for(const node of [copy, ...copy.querySelectorAll("*")])
    for(const {name} of [...node.attributes]) if(name === "style" || name === "class" || name === "id" || name.startsWith("on")) node.removeAttribute(name)
  return copy
}

/** Authors often pad headings with line breaks; a miniature has no room for them. */
function trimBreaks(fragment: DocumentFragment) {
  const nodes: Node[] = []
  const walk = (node: Node) => { for(const child of node.childNodes) { nodes.push(child); walk(child) } }
  walk(fragment)
  const content = nodes.map(node => node.nodeType === Node.TEXT_NODE ? !!node.textContent?.trim() : (node as Element).localName === "math")
  const first = content.indexOf(true), last = content.lastIndexOf(true)
  nodes.forEach((node, index) => { if((node as Element).localName === "br" && (index < first || index > last)) node.parentNode?.removeChild(node) })
}

const clamp = (lines: number) => `--lines: ${lines}`
const decimal = (x: Excerpt, value: number) => new Intl.NumberFormat(x.lang).format(value)
const tiles = (sources: string[]) => html`<div class="tiles" style=${`grid-template-columns: repeat(${sources.length}, 1fr)`}>${sources.map(source => html`<img src=${source} alt="">`)}</div>`
const byFile = (x: Excerpt, name: string) => x.src(`img[src$="/${name}"]`)

/** The lesson's interval examples on one staff, spelled without accidentals like its notation table. */
function intervalStaff(x: Excerpt) {
  const names = x.lang.startsWith("de")
    ? ["r1", "k2", "g2", "k3", "g3", "r4", "ü4", "v5", "r5", "k6", "g6", "k7", "g7", "r8"]
    : ["P1", "m2", "M2", "m3", "M3", "P4", "A4", "d5", "P5", "m6", "M6", "m7", "M7", "P8"]
  const steps = [[-2, -2], [0, 1], [-2, -1], [0, 2], [-2, 0], [-2, 1], [1, 4], [-3, 1], [-2, 2], [0, 5], [-2, 3], [-1, 5], [-2, 4], [-2, 5]]
  const y = (step: number) => 58 - step * 4
  return html`<svg viewBox="0 0 351 104" preserveAspectRatio="xMidYMid slice" class="staff">
    ${[26, 34, 42, 50, 58].map(line => svg`<path d=${`M6 ${line}h340`} class="line"/>`)}
    <path d="M343 26v32" class="line"/><path d="M346.5 26v32" class="line" stroke-width="2.4"/>
    <text x="7" y="61.6" class="clef">𝄞</text>
    ${steps.map(([low, high], index) => {
      const x = 54 + index * 21.4
      const heads = high - low <= 1 ? [x - 5.4, x + 5.4] : [x, x]
      return svg`${low <= -2 ? svg`<path d=${`M${heads[0] - 8.5} ${y(-2)}h${heads[1] - heads[0] + 17}`} class="line"/>` : nothing}
        ${[low, high].map((step, head) => svg`<ellipse cx=${heads[head]} cy=${y(step)} rx="5.1" ry="3.7" transform=${`rotate(-18 ${heads[head]} ${y(step)})`}/>`)}
        <text x=${x} y="95" class="name">${names[index]}</text>`
    })}
  </svg>`
}

/** A music-score widget as authored for the task: treble clef, 4/4 and four quarter rests to replace. */
const emptyBar = html`<svg viewBox="0 0 140 30" class="bar">
  ${[8, 12, 16, 20, 24].map(line => svg`<path d=${`M2 ${line}h135`} class="line"/>`)}
  <text x="2" y="26.4" class="clef">𝄞</text><text x="19" y="15.2" class="time">4</text><text x="19" y="23.2" class="time">4</text>
  ${[42, 68, 94, 118].map(x => svg`<path d=${`M${x} 9.6l2.7 3.3-2.4 2.9 2.9 3.4c-1.7-.8-3.5-.3-2.3 2.5`} class="rest"/>`)}
  <path d="M133.4 8v16" class="line"/><path d="M136.2 8v16" class="line" stroke-width="1.8"/>
</svg>`

const molecule = html`<svg viewBox="0 0 120 50" class="molecule">
  <ellipse cx="66" cy="28" rx="46" ry="21" class="cloud"/><path d="M38 28h22" class="bond"/>
  <circle cx="30" cy="28" r="10" class="hydrogen"/><circle cx="76" cy="28" r="17" class="chlorine"/>
  <text x="30" y="31.6">H</text><text x="76" y="32">Cl</text><text x="30" y="11" class="partial">δ+</text><text x="76" y="8" class="partial">δ−</text>
</svg>`

/** Elements by group and period, shaded by electronegativity; the lesson's hydrogen and chlorine are marked. */
const periodicTable = html`<div class="periodic">${Array.from({length: 5 * 18}, (_, cell) => {
  const period = Math.floor(cell / 18) + 1, group = cell % 18 + 1
  const present = period > 3 || (period === 1 ? group === 1 || group === 18 : group <= 2 || group >= 13)
  if(!present) return html`<i class="gap"></i>`
  const strength = group === 18 ? 0 : Math.min(1, group / 17 * .8 + (5 - period) * .06)
  const marked = period === 1 && group === 1 || period === 3 && group === 17
  return html`<i class=${marked ? "marked" : ""} style=${`background: hsl(205 55% ${Math.round(94 - strength * 46)}%)`}></i>`
})}</div>`

const pendulumSimulation = html`<svg viewBox="0 0 280 96" class="simulation">
  <path d="M60 8h100" stroke="#8796a8" stroke-width="3"/><path d="M110 8v4" stroke="#8796a8" stroke-width="2"/>
  <path d="M78 40a34 34 0 0 0 64 0" fill="none" stroke="#9fb3c8" stroke-dasharray="2 2"/>
  <path d="M110 10L126 74" stroke="#334" stroke-width=".9"/><circle cx="126" cy="76" r="7" fill="#2f6fd0"/>
  <rect x="16" y="14" width="10" height="70" rx="1.5" fill="#f6e7a6" stroke="#c9b25a"/>
  ${Array.from({length: 10}, (_, mark) => svg`<path d=${`M16 ${18 + mark * 7}h${mark % 2 ? 4 : 6}`} stroke="#9c8a3d" stroke-width=".6"/>`)}
  <rect x="38" y="66" width="36" height="20" rx="3" fill="#fff" stroke="#9aa8b8"/><text x="56" y="79" class="watch">00.00</text>
  <rect x="190" y="10" width="78" height="76" rx="5" fill="#fff" stroke="#c4d2e0"/>
  <path d="M198 26h62M198 50h62" stroke="#9aa8b8" stroke-width="1.6"/><circle cx="231" cy="26" r="3.4" fill="#2f6fd0"/><circle cx="214" cy="50" r="3.4" fill="#2f6fd0"/>
  <rect x="198" y="66" width="62" height="11" rx="5.5" fill="#eef3f8" stroke="#c4d2e0"/>
</svg>`

/** The virtual lab's glassware: water, two beakers of acid, and the antacid's sodium hydrogen carbonate. */
function glassware(x: Excerpt, hero = false) {
  const acid = `${decimal(x, .1)} M HCl`
  return hero ? html`<svg viewBox="0 0 351 104" preserveAspectRatio="xMidYMid slice" class="lab-hero">
      ${Array.from({length: 9}, (_, row) => svg`<path d=${`M0 ${row * 13}h351`} class="grid"/>`)}${Array.from({length: 28}, (_, column) => svg`<path d=${`M${column * 13} 0v104`} class="grid"/>`)}
      <g class="glass"><path d="M58 18v14l-16 40a4 4 0 0 0 3.6 5.6h40.8a4 4 0 0 0 3.6-5.6l-16-40v-14M54 18h22"/><path d="M108 14h4v62a4 4 0 0 0 4 4h52a4 4 0 0 0 4-4v-62h4"/><path d="M182 14h4v62a4 4 0 0 0 4 4h52a4 4 0 0 0 4-4v-62h4"/><path d="M276 14v54a8 8 0 0 0 16 0v-54M272 14h24"/></g>
      <path d="M47.9 60H84.1L89.1 72.5A3 3 0 0 1 86.3 76.6H45.7A3 3 0 0 1 42.9 72.5Z" class="water"/><rect x="113" y="46" width="58" height="33" class="acid"/><rect x="187" y="46" width="58" height="33" class="acid"/>
      ${[164, 238].flatMap(left => [30, 40, 50, 60, 70].map(top => svg`<path d=${`M${left} ${top}h6`} class="tick"/>`))}
      <path d="M277 60h14v8a7 7 0 0 1-14 0z" class="powder"/><g class="pour"><path d="M84 28q14-16 30-8"/><path d="M272 28q-14-16-28-8"/></g>
      <text x="66" y="96">H₂O</text><text x="142" y="96">${acid}</text><text x="216" y="96">${acid}</text><text x="284" y="96">NaHCO₃</text>
    </svg>`
    : html`<svg viewBox="0 0 150 80" class="lab">
      <g class="glass"><path d="M14 28v6l-9 30a3 3 0 0 0 3 4h24a3 3 0 0 0 3-4l-9-30v-6"/><path d="M42 22v44a3 3 0 0 0 3 3h30a3 3 0 0 0 3-3v-44"/><path d="M86 22v44a3 3 0 0 0 3 3h30a3 3 0 0 0 3-3v-44"/><path d="M132 26v36a4 4 0 0 0 8 0v-36"/></g>
      <path d="M8.4 56H31.6L34.1 64.4A2 2 0 0 1 32.2 67H7.8A2 2 0 0 1 5.9 64.4Z" class="water"/><rect x="43" y="44" width="34" height="24" class="acid"/><rect x="87" y="44" width="34" height="24" class="acid"/><path d="M133 58h6v4a3 3 0 0 1-6 0z" class="powder"/>
      <text x="20" y="77">H₂O</text><text x="60" y="77">${acid}</text><text x="104" y="77">${acid}</text><text x="136" y="77">NaHCO₃</text>
    </svg>`
}

type OrganizerBox = {position: {x: number, y: number}, dimension: {width: number, height: number}}
type Organizer = {
  nodes: (OrganizerBox & {id: string, label?: {text?: string}, style?: {fill?: string, stroke?: string}})[]
  edges?: {source: string, target: string}[]
  images?: (OrganizerBox & {src: string})[]
}
const colour = (value: string | undefined, fallback: string) => value && /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(value) ? value : fallback

/** The advance organizer's concept map at miniature scale; labels stay legible, positions stay authored. */
function conceptMap(organizer: Organizer | undefined, width = 178, height = 128) {
  if(!organizer?.nodes?.length) return nothing
  const boxes: OrganizerBox[] = [...organizer.nodes, ...organizer.images ?? []]
  const left = Math.min(...boxes.map(box => box.position.x)), top = Math.min(...boxes.map(box => box.position.y))
  const right = Math.max(...boxes.map(box => box.position.x + box.dimension.width)), bottom = Math.max(...boxes.map(box => box.position.y + box.dimension.height))
  const scale = Math.min(width / (right - left), height / (bottom - top))
  const place = (box: OrganizerBox) => ({x: (box.position.x - left) * scale, y: (box.position.y - top) * scale, w: box.dimension.width * scale, h: box.dimension.height * scale})
  const centres = new Map(organizer.nodes.map(node => { const {x, y, w, h} = place(node); return [node.id, [x + w / 2, y + h / 2]] as const }))
  return html`<div class="concept" style=${`height: ${(bottom - top) * scale}px`}>
    <svg viewBox=${`0 0 ${width} ${(bottom - top) * scale}`}>${(organizer.edges ?? []).map(edge => {
      const from = centres.get(edge.source), to = centres.get(edge.target)
      return from && to ? svg`<path d=${`M${from[0]} ${from[1]}L${to[0]} ${to[1]}`}/>` : nothing
    })}</svg>
    ${(organizer.images ?? []).map(image => { const {x, y, w, h} = place(image); return html`<img src=${image.src} alt="" style=${`left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px`}>` })}
    ${organizer.nodes.map(node => {
      const {x, y, w, h} = place(node)
      return html`<span class="node" style=${`left: ${x + w / 2}px; top: ${y + h / 2}px; min-width: ${w}px; max-width: ${Math.max(w, 64)}px; background: ${colour(node.style?.fill, "#fff")}; border-color: ${colour(node.style?.stroke, "#94a3b8")}`}>${normalize(node.label?.text)}</span>`
    })}
  </div>`
}

export type Miniature = {hero: TemplateResult, mini: TemplateResult, missing: string[]}
type Recipe = (x: Excerpt) => Omit<Miniature, "missing">

/** Hand-made miniatures: positions and drawings are curated, every word and picture comes from the lesson. */
const recipes: Record<string, Recipe> = {
  "ahr-valley": x => {
    const timeline = x.scope("#ahrflut-zeitleiste")
    const statements = x.all("webwriter-true-false p")
    return {
      hero: html`<img src=${x.src("#ww-1or7lnn img")} alt="" style="object-position: center 40%">`,
      mini: html`
        <div class="item" style="left: 8px; top: 8px; width: 186px"><b class="label">${x.text("body > p", 0)}</b><p class="clamp" style=${clamp(2)}>${x.text("body > p", 1)}</p>
          <div class="pair">${["#ww-olri8y", "#ww-nht3h2"].map(id => html`<figure><img src=${x.src(`${id} img`)} alt="" style="height: 62px"><figcaption>${x.text(`${id} figcaption`)}</figcaption></figure>`)}</div></div>
        <div class="item" style="left: 202px; top: 8px; width: 118px"><b class="label">${x.text("body > p", 6)}</b>
          ${statements.slice(-2).map(statement => html`<p class="clamp" style=${clamp(3)}>${readableText(statement)}</p><div class="choices"><span>✓</span><span>✗</span></div>`)}</div>
        <div class="item" style="left: 8px; top: 138px; width: 150px"><p class="clamp" style=${clamp(7)}>${x.text("#ahrtal-overview-text > p", 0)} ${x.text("#ahrtal-overview-text > p", 1)}</p></div>
        <div class="item" style="left: 166px; top: 156px; width: 154px"><b class="label">${x.text("body > p", 2)}</b><div class="video"><i></i></div></div>
        <div class="item" style="left: 22px; top: 244px; width: 298px"><b class="label">${x.text("body > p", 7)}</b>
          <div class="timeline">${[["#d6a83a", 0], ["#c8352e", 2], ["#9b2c2c", 4]].map(([dot, index]) => html`<span style=${`--dot: ${dot}`}><time>${timeline.text("article time", index as number)}</time>${timeline.text("article h3", index as number)}</span>`)}</div></div>`,
    }
  },

  "printing-press": x => {
    const [effects, tasks, timeline] = [0, 1, 2].map(index => x.scope("section.ww-board-column", index))
    return {
      hero: html`<img src=${x.src('img[src*="Nuremberg_chronicles"]')} alt="" style="object-position: center 45%">`,
      mini: html`<div class="lanes">
        <div class="column white" style="width: 134px"><h5>${effects.text("h2")}</h5><div class="card dashed"><p>${effects.text("article p")}</p></div></div>
        <div class="column light" style="width: 122px"><h5>${tasks.text("h2")}</h5>${tasks.texts("webwriter-text p").map(task => html`<div class="card"><p>${task}</p><div class="answer"></div></div>`)}</div>
        <div class="group"><div class="column blue" style="width: 150px"><h5>${timeline.text("h2")}</h5>
          <div class="card"><img src=${timeline.src("webwriter-timeline-event img")} alt="" style="height: 60px"><b>${timeline.text("webwriter-timeline-event h2")}</b><p>${timeline.text("webwriter-timeline-event p")}</p></div></div></div>
      </div>`,
    }
  },

  "machine-learning": x => {
    const [learn, what, lost] = [0, 1, 2].map(index => x.scope("section.ww-board-column", index))
    const [fair, ...story] = learn.texts("article:nth-of-type(2) > p")
    return {
      hero: tiles([13, 14, 15, 16, 17, 18].map(image => byFile(x, `image-${image}.jpg`))),
      mini: html`<div class="lanes">
        <div class="column white" style="width: 134px"><h5>${learn.text("h2")}</h5><p class="subtitle">${learn.text("article p")}</p>
          <div class="card dashed justified"><p><b>${fair}</b></p>${story.map(paragraph => html`<p>${paragraph}</p>`)}</div></div>
        <div class="column blue" style="width: 122px"><h5>${what.text("h2")}</h5><div class="card filled"><p>${what.text("article p")}</p></div><div class="card"><p>${what.text("article p", 1)}</p></div></div>
        <div class="group"><div class="column light" style="width: 150px"><h5>${lost.text("h2")}</h5>
          <div class="card"><div class="mosaic">${[1, 7, 2, 8].map(image => html`<img src=${byFile(x, `image-${image}.jpg`)} alt="">`)}</div><p>${lost.text("article p")}</p></div></div></div>
      </div>`,
    }
  },

  "ozone-hole": x => {
    const table = x.scope("body > table", 3)
    const heading = ["color", "background-color"]
    return {
      hero: tiles(["image-1.jpg", "image-3.jpg", "image-2.jpg"].map(image => byFile(x, image))),
      mini: html`
        <div class="item" style="left: 8px; top: 8px; width: 168px"><span class="step">${x.text("body > h3", 0)}</span><b class="label">${x.text("body > h1", 1)}</b><p class="clamp" style=${clamp(5)}>${x.scope("body > table", 0).text("p")}</p></div>
        <div class="item" style="left: 184px; top: 8px; width: 136px"><span class="step">${x.text("body > h3", 1)}</span><b class="label">${x.rich("body > h1", 4, heading)}</b>${molecule}</div>
        <div class="item" style="left: 8px; top: 98px; width: 168px"><b class="label">${x.text("body > h1", 2)}</b><p class="clamp" style=${clamp(5)}>${x.scope("body > table", 1).text("p")}</p></div>
        <div class="item" style="left: 184px; top: 98px; width: 136px"><b class="label">${x.rich("body > h1", 5, heading)}</b>${periodicTable}</div>
        <div class="item" style="left: 8px; top: 196px; width: 168px"><b class="label">${x.text("body > h1", 3)}</b>
          <table class="data"><tr>${table.texts("th").map(cell => html`<th>${cell}</th>`)}</tr>${table.all("tbody tr").map((_, row) => html`<tr>${[0, 1, 2].map(cell => html`<td>${table.scope("tbody tr", row).rich("td", cell)}</td>`)}</tr>`)}</table></div>
        <div class="item" style="left: 184px; top: 182px; width: 136px"><span class="step">${x.text("body > h3", 3)}</span><b class="label">${x.text("body > h1", 7)}</b><p class="clamp" style=${clamp(5)}>${x.scope("body > table", 7).text("p")}</p></div>`,
    }
  },

  "intervals-and-rhythms": x => {
    const [, , taskA, listen, taskB] = [0, 1, 2, 3, 4].map(index => x.scope("section.ww-board-column", index))
    return {
      hero: intervalStaff(x),
      mini: html`<div class="lanes end">
        <div class="group"><div class="column light" style="width: 120px"><h5>${taskA.text("h2")}</h5><div class="card"><div class="summary closed">${taskA.text("summary")}</div></div><div class="card"><p>${taskA.text("webwriter-text p")}</p><div class="answer" style="height: 40px"></div></div></div></div>
        <div class="group"><div class="column blue" style="width: 106px"><h5>${listen.text("h2")}</h5>${listen.texts("details > summary").map(level => html`<div class="card"><div class="summary">${level}</div><div class="audio"><i></i>0:00</div></div>`)}</div>
          <div class="column light" style="width: 154px"><h5>${taskB.text("h2")}</h5>${taskB.all("script[data-music-score]").map((_, index) => html`<div class="card score"><small>${taskB.data<{score?: {title?: string}}>("script[data-music-score]", index)?.score?.title ?? ""}</small>${emptyBar}</div>`)}</div></div>
      </div>`,
    }
  },

  "food-chains": x => {
    const organizer = x.data<Organizer>("webwriter-advance-organizer > script")
    return {
      hero: tiles((organizer?.images ?? []).map(image => image.src)),
      mini: html`
        <b class="heading" style="left: 10px; top: 9px">${x.text("body > h1")}</b>
        <p class="free clamp" style=${`left: 126px; top: 9px; width: 194px; ${clamp(3)}`}>${x.text("body > p", 1)}</p>
        <b class="free label" style="left: 10px; top: 50px">${x.text("body > p", 0)}</b>
        <div class="item" style="left: 8px; top: 64px; width: 190px">${conceptMap(organizer)}</div>
        <div class="item" style="left: 206px; top: 56px; width: 114px"><p class="clamp" style=${clamp(5)}>${x.text("webwriter-order > div > p")}</p>
          <div class="order">${x.texts("webwriter-order-item").map(item => html`<span>${item}</span>`)}</div>
          <p>${x.text("webwriter-text p")}</p><div class="answer"></div>
          <div class="speech"><i></i><p>${x.text("webwriter-speech p")}</p></div></div>`,
    }
  },

  "pendulum": x => ({
    hero: html`<div class="pendulum">
      <svg viewBox="0 0 150 104">
        <path d="M40 12h90" class="ceiling"/>${Array.from({length: 11}, (_, mark) => svg`<path d=${`M${44 + mark * 8} 12l-5-6`} class="hatch"/>`)}
        <path d="M64.6 82.5a72 72 0 0 0 40.8 0" class="arc"/><g class="ghost"><path d="M85 12L64.6 82.5M85 12L105.4 82.5"/><circle cx="64.6" cy="82.5" r="7"/><circle cx="105.4" cy="82.5" r="7"/></g>
        <path d="M85 12v72" class="rest"/><g class="swing"><path d="M85 12v72"/><circle cx="85" cy="84" r="8"/></g>
      </svg>
      <div class="formulas"><span class="main">${x.rich("body math", 2)}</span><span>${x.rich("body math", 7)}</span></div>
    </div>`,
    mini: html`<div class="sheet">
      <h4>${x.text("body > h2")}</h4>
      <div class="flow">
        <div style="width: 37%; flex: none"><div class="box light">${x.text("body > p", 3)}</div><div class="box dashed"><p class="clamp" style=${clamp(14)}>${x.rich("body > p", 4)}</p></div></div>
        <div class="box blue" style="flex: 1"><p class="clamp" style=${clamp(15)}>${x.rich("body > p", 5)}</p></div>
      </div>
      <div class="simulation">${pendulumSimulation}</div>
    </div>`,
  }),

  "heartburn": x => ({
    hero: glassware(x, true),
    mini: html`<div class="sheet">
      <div class="flow"><h4 class="title" style="width: 40%; flex: none">${x.rich("body > h1", 0, ["color"])}</h4><div class="box navy" style="flex: 1"><p class="clamp" style=${clamp(6)}>${x.rich("body > p", 1)}</p></div></div>
      <p>${x.text("body > p", 2)}</p>
      <div class="statements">${["image-1.png", "image-2.png"].map(image => html`<img src=${byFile(x, image)} alt="">`)}</div>
      <div class="disclosure">${x.text("body > details > summary")}</div>
      <div class="flow"><div class="box navy" style="width: 46%; flex: none"><p class="clamp" style=${clamp(8)}>${x.text("body > p", 3)}</p></div><div class="lab-frame">${glassware(x)}</div></div>
    </div>`,
  }),
}

export const hasMiniature = (id: string) => Object.hasOwn(recipes, id)

export function exampleMiniature(id: string, source: Document): Miniature | undefined {
  if(!hasMiniature(id)) return undefined
  const excerpt = new Excerpt(source)
  return {...recipes[id](excerpt), missing: excerpt.missing}
}

/** Miniatures are drawn at 327 px wide and zoomed to their frame, so their proportions never change. */
export const miniatureWidth = 327
/** The frame's side margins and borders, which stay unscaled. */
export const miniatureInset = 22

export const miniatureStyles = css`
  .hero {position: relative; flex: none; aspect-ratio: 27 / 8; max-block-size: 9.5rem; overflow: hidden; background: #e9eff6}
  .hero > img, .hero > svg {display: block; inline-size: 100%; block-size: 100%; object-fit: cover}
  .tiles {display: grid; gap: 2px; block-size: 100%; background: #fff}
  .tiles img {display: block; inline-size: 100%; block-size: 100%; min-inline-size: 0; object-fit: cover}
  .staff {background: #1f4e78}
  .staff .line {stroke: #7ea6cf; stroke-width: 1}
  .staff .clef {fill: #fff; font: 42px "Apple Symbols", "Segoe UI Symbol", "Noto Music", serif}
  .staff ellipse {fill: none; stroke: #fff; stroke-width: 1.8}
  .staff .name {fill: #b6d0ea; font: 600 8px system-ui, sans-serif; text-anchor: middle}
  .pendulum {display: flex; align-items: center; gap: .4rem; block-size: 100%; padding-inline-end: .75rem; background: #2e75b6; color: #fff}
  .pendulum svg {flex: none; block-size: 100%; aspect-ratio: 150 / 104}
  .pendulum .ceiling {stroke: #cfe1f3; stroke-width: 2.4}
  .pendulum .hatch {stroke: #9fc2e4}
  .pendulum .arc {fill: none; stroke: #9fc2e4; stroke-dasharray: 2 3}
  .pendulum .ghost {stroke: #fff; fill: #fff; opacity: .28}
  .pendulum .rest {stroke: #9fc2e4; stroke-dasharray: 1.5 3}
  .pendulum .swing {stroke: #fff; stroke-width: 1.2; fill: #fff; transform-origin: 85px 12px; animation: swing 2.4s ease-in-out infinite alternate}
  @keyframes swing {from {transform: rotate(16deg)} to {transform: rotate(-16deg)}}
  @media (prefers-reduced-motion: reduce) {.pendulum .swing {animation: none}}
  .formulas {display: grid; gap: .1rem; min-inline-size: 0}
  .formulas math {font-size: .78rem; font-family: "STIX Two Math", "Latin Modern Math", "Cambria Math", math; math-style: normal}
  .formulas .main math {font-size: 1.1rem}
  .lab-hero {background: #065986}
  .lab-hero .grid {stroke: #ffffff10}
  .lab-hero .glass {fill: none; stroke: #fff; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round}
  .lab-hero .water {fill: #7fd0f2; opacity: .75}
  .lab-hero .acid {fill: #9cc7ec; opacity: .7}
  .lab-hero .tick {stroke: #fff; stroke-width: .8; opacity: .7}
  .lab-hero .powder {fill: #fff}
  .lab-hero .pour {fill: none; stroke: #bfe1f5; stroke-width: 1.2; stroke-dasharray: 2.5 3}
  .lab-hero text {fill: #dbeefa; font: 600 9px system-ui, sans-serif; text-anchor: middle}

  .frame {position: relative; flex: 1; min-block-size: 0; margin: 0 10px; overflow: hidden; border: 1px solid #d5dee8; border-block-end: 0; border-radius: 8px 8px 0 0; background: #fff}
  .frame.canvas {background: radial-gradient(#cbd6e3 .8px, transparent .9px) 0 0 / 10px 10px #f6f8fb}
  .frame.board {background: #edf1f5}
  .frame.board::after {content: ""; position: absolute; inset-block: 0; inset-inline-end: 0; inline-size: 22px; background: linear-gradient(90deg, #edf1f500, #edf1f5); pointer-events: none}
  .frame.board:has(.end)::after {inset-inline: 0 auto; background: linear-gradient(270deg, #edf1f500, #edf1f5)}
  .frame.document {background: #e6ebf1}
  .mini {position: absolute; inset-block-start: 0; inset-inline-start: 0; inline-size: ${miniatureWidth}px; block-size: 60rem; zoom: var(--miniature-zoom, 1); color: #2f3742; font-size: 7.4px; line-height: 1.36; overflow-wrap: break-word}
  .mini p {margin: 0 0 .5em}
  .mini p:last-child {margin-block-end: 0}
  .mini figure {margin: 0}
  .mini img {display: block; inline-size: 100%; object-fit: cover; border-radius: 2px}
  .mini math {font-family: "STIX Two Math", "Latin Modern Math", "Cambria Math", math; font-size: 1.1em}
  .clamp {display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--lines, 3); overflow: hidden}

  .item {position: absolute; padding: 6px; background: #fff; border-radius: 5px; box-shadow: 0 1px 4px #1f2d3d24}
  .label {display: block; margin-block-end: 3px; color: #1d2b3c; font-size: 8.2px; font-weight: 700; line-height: 1.22}
  .label span[style*="background"]:not(:empty) {display: inline-block; margin-inline-end: 2px; padding-inline: 2.5px; border-radius: 2px}
  .free, .heading {position: absolute}
  .heading {inline-size: 112px; color: #1d2b3c; font-size: 13px; line-height: 1.1; letter-spacing: -.02em}
  .step {float: inline-end; margin-inline-start: 4px; color: #617084; font-size: 6.6px; font-weight: 700}
  figcaption {margin-block-start: 2px; color: #5d6b7c; font-size: 6.6px}
  .pair {display: grid; grid-template-columns: 1fr 1fr; gap: 5px}
  .choices {display: flex; gap: 4px; margin: 2px 0 6px}
  .choices span {flex: 1; padding-block: 1px; border: 1px solid #c8d4e1; border-radius: 3px; color: #2c4a66; font-weight: 700; text-align: center}
  .answer {block-size: 16px; margin-block-start: 3px; border: 1px solid #c8d4e1; border-radius: 3px; background: #fff}
  .video {display: grid; place-items: center; block-size: 46px; border-radius: 3px; background: linear-gradient(135deg, #2c4c63, #5f8a73)}
  .video i {display: grid; place-items: center; inline-size: 22px; block-size: 22px; border-radius: 50%; background: #0009}
  .video i::after {content: ""; margin-inline-start: 2px; border-inline-start: 8px solid #fff; border-block: 5px solid transparent}
  .timeline {position: relative; display: flex; gap: 8px; padding-block-start: 10px}
  .timeline::before {content: ""; position: absolute; inset-inline: 3px 0; inset-block-start: 3px; block-size: 1.5px; background: #d5dee8}
  .timeline span {position: relative; flex: 1; min-inline-size: 0; font-weight: 650}
  .timeline span::before {content: ""; position: absolute; inset-inline-start: 0; inset-block-start: -10px; inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--dot); box-shadow: 0 0 0 2px #fff}
  .timeline time {display: block; overflow: hidden; color: #617084; font-size: 6.4px; white-space: nowrap; text-overflow: ellipsis}
  .periodic {display: grid; grid-template-columns: repeat(18, 1fr); gap: 1.3px}
  .periodic i {aspect-ratio: 1; border-radius: 1px}
  .periodic .gap {background: none}
  .periodic .marked {outline: 1.4px solid #c8352e; outline-offset: .4px}
  .molecule {display: block; inline-size: 100%}
  .molecule .cloud {fill: #7fb7e8; opacity: .3}
  .molecule .bond {stroke: #7d8ea3; stroke-width: 3}
  .molecule .hydrogen {fill: #f1f4f7; stroke: #9aa8b8}
  .molecule .chlorine {fill: #c8e7bb; stroke: #6aa25a}
  .molecule text {fill: #33445a; font: 10px system-ui, sans-serif; text-anchor: middle}
  .molecule .partial {fill: #617084; font-size: 7.5px}
  .data {inline-size: 100%; border-collapse: collapse; font-size: 6.8px}
  .data :is(th, td) {padding: 1.5px 3px; border: 1px solid #dfe5ed; text-align: start}
  .data th {background: #f2f5f9}
  .concept {position: relative}
  .concept svg {position: absolute; inset: 0; inline-size: 100%; block-size: 100%; fill: none; stroke: #94a3b8; stroke-width: .9}
  .concept img {position: absolute; border-radius: 1.5px}
  .concept .node {position: absolute; z-index: 1; translate: -50% -50%; padding: 1.5px 4px; border: 1px solid; border-radius: 1.5px; font-size: 6.4px; font-weight: 700; line-height: 1.25; text-align: center}
  .order {margin: 3px 0 6px}
  .order span {display: flex; align-items: center; gap: 4px; margin-block-start: 3px; padding: 2px 4px; border: 1px solid #d5dee8; border-radius: 3px; background: #fbfcfe; font-weight: 600}
  .order span::before {content: "⋮⋮"; color: #9aa8b8; font-size: 6px; letter-spacing: -1px}
  .speech {display: flex; gap: 5px; align-items: flex-start; margin-block-start: 7px; padding: 4px; border-radius: 4px; background: #f2f5f9}
  .speech i {flex: none; inline-size: 13px; block-size: 13px; border-radius: 50%; background: #c8352e; box-shadow: inset 0 0 0 3.5px #f2f5f9, 0 0 0 1px #c8352e}

  .lanes {position: absolute; inset-block-start: 8px; inset-inline-start: 8px; display: flex; gap: 6px; align-items: flex-start}
  .lanes.end {inset-inline: 0 6px; justify-content: flex-end}
  .column {flex: none; padding: 5px; border: 1px solid; border-radius: 9px}
  .column > h5 {margin: 1px 2px 5px; font-size: 8.4px; line-height: 1.2}
  .column.white {border-color: #fff; border-radius: 3px; background: #fff}
  .column.light {border-color: #5b9bd5; background: #deebf7; box-shadow: 0 2px 4px #0002}
  .column.blue {border-color: #1f4e78; background: #2e75b6; color: #fff; box-shadow: 0 2px 4px #0002}
  .subtitle {margin: -2px 2px 5px; font-weight: 700}
  .group {flex: none; display: flex; gap: 6px; align-items: flex-start; padding: 5px; border-radius: 10px; background: #fff; box-shadow: 0 2px 5px #0002}
  .card {margin-block-end: 5px; padding: 6px; border-radius: 8px; background: #fff; color: #2f3742; box-shadow: 0 2px 4px #0002}
  .card.dashed {border: 2px dashed #a6a6a6; border-radius: 3px; box-shadow: none}
  .card.filled {border: 1px solid #2e75b6; background: #2e75b6; color: #fff; box-shadow: none}
  .card.justified {text-align: justify}
  .card > img {margin-block-end: 4px; border-radius: 3px}
  .card > b {display: block; margin-block-end: 2px}
  .mosaic {display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-block-end: 4px}
  .mosaic img {block-size: 40px}
  .summary {margin-block-end: 3px; font-weight: 650}
  .summary::before {content: "▾ "; color: #5d6b7c}
  .summary.closed {margin: 0}
  .summary.closed::before {content: "▸ "}
  .audio {display: flex; align-items: center; gap: 4px; block-size: 14px; padding-inline: 6px; border-radius: 999px; background: #f1f3f4; color: #3c4043; font-size: 6px}
  .audio::before {content: ""; border-inline-start: 5px solid #3c4043; border-block: 3.5px solid transparent}
  .audio i {flex: 1; block-size: 2px; border-radius: 1px; background: #c4c7ca}
  .score {padding: 4px 6px 3px; text-align: center}
  .score small {display: block; font-size: 6.6px; font-weight: 650}
  .bar {display: block; inline-size: 100%}
  .bar .line {stroke: #5c6878; stroke-width: .6}
  .bar .clef {fill: #2f3742; font: 23px "Apple Symbols", "Segoe UI Symbol", "Noto Music", serif}
  .bar .time {fill: #2f3742; font: 700 8.6px Georgia, "Times New Roman", serif}
  .bar .rest {fill: none; stroke: #2f3742; stroke-width: 1.35; stroke-linejoin: round; stroke-linecap: round}

  .sheet {position: absolute; inset-inline: 14px; inset-block: 10px 0; padding: 10px 11px; background: #fff; box-shadow: 0 1px 5px #1f2d3d22}
  .sheet h4 {margin: 0 0 7px; color: #1d2b3c; font-size: 10px; line-height: 1.2}
  .sheet h4.title {color: #065986; font-size: 11.5px; font-weight: 600}
  .flow {display: flex; gap: 7px; align-items: flex-start}
  .box {margin-block-end: 6px; padding: 5px 6px; border-radius: 3px; box-shadow: 0 2px 4px #0002}
  .box.light {background: #deebf7; font-weight: 700}
  .box.dashed {border: 2px dashed #a6a6a6}
  .box.blue {background: #2e75b6; color: #fff}
  .box.navy {background: #065986; color: #fff; text-align: justify}
  .simulation {display: block; inline-size: 100%; margin-block-start: 2px; border: 1px solid #c4d2e0; background: #e5f1fa}
  .simulation .watch {fill: #334; font: 7.5px ui-monospace, Menlo, monospace; text-anchor: middle}
  .statements {display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-block-end: 6px; padding: 5px; border-radius: 3px; background: #deebf7}
  .statements img {block-size: 44px; object-position: top; border-radius: 6px}
  .disclosure {margin-block-end: 6px; padding: 4px 6px; border: 2px dashed #a6a6a6; border-radius: 9px; font-weight: 600}
  .disclosure::before {content: "▸ "; color: #5d6b7c}
  .lab-frame {flex: 1; block-size: 82px; border: 1px solid #c4d2e0; background: linear-gradient(#e8eef5 1px, transparent 1px) 0 0 / 10px 10px, linear-gradient(90deg, #e8eef5 1px, transparent 1px) 0 0 / 10px 10px, #fff}
  .lab {display: block; inline-size: 100%; block-size: 100%}
  .lab .glass {fill: none; stroke: #065986; stroke-width: 1.2; stroke-linejoin: round}
  .lab .water {fill: #bfe6f7}
  .lab .acid {fill: #cfe3f6}
  .lab .powder {fill: #fff; stroke: #9aa8b8; stroke-width: .6}
  .lab text {fill: #065986; font: 6.4px system-ui, sans-serif; text-anchor: middle}
`
