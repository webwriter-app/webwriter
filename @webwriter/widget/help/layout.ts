// The layout of Help's labels: plain geometry, no DOM.

/** A rectangle in the coordinates of the overlay. */
export type Box = {left: number; top: number; right: number; bottom: number}
/** A side of an element. */
export type Side = "top" | "right" | "bottom" | "left"
/** The corner points of a connector, from the element to the label. */
export type Line = [number, number][]

/** One label to place. */
export type LabelItem = {
  /** The marked element. */
  target: Box
  /** Size of its label. */
  width: number
  height: number
  /** Sides to try, in order. */
  sides: Side[]
  /** A large element: the label goes inside it. */
  region: boolean
  /** Where CSS anchor positioning put the label, if it is in use. */
  css?: Box
}

/** Where a label goes. */
export type LabelPlacement = {
  box: Box
  /** Corner points of the connector, or null for a label that sits next to or inside its element. */
  line: Line | null
  /** The position CSS chose was kept. */
  css: boolean
}

const SIDES: Side[] = ["bottom", "top", "right", "left"]
const OPPOSITE: Record<Side, Side> = {top: "bottom", bottom: "top", left: "right", right: "left"}
const GAP = 6 // between a label and its element
const RISE = 14 // shortest connector
const HOOK = 10 // how far a label reaches past its connector
const SPREAD = 14 // between the connectors of one staircase
const LANE = 6 // between connectors that run side by side
const STACK = 4 // between the labels of one stack
const SLACK = 0.5 // sub-pixel tolerance of measured rectangles
const BUDGET = 1500 // placements tried before the layout is given up

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const overlaps = (a: Box, b: Box) => a.left < b.right - SLACK && a.right > b.left + SLACK && a.top < b.bottom - SLACK && a.bottom > b.top + SLACK
const inside = (a: Box, b: Box) => a.left >= b.left - SLACK && a.right <= b.right + SLACK && a.top >= b.top - SLACK && a.bottom <= b.bottom + SLACK
const boxAt = (left: number, top: number, item: LabelItem): Box => ({left, top, right: left + item.width, bottom: top + item.height})
const centreX = (box: Box) => (box.left + box.right) / 2
const centreY = (box: Box) => (box.top + box.bottom) / 2
const upright = (side: Side) => side === "top" || side === "bottom"

/** The segments of a connector as thin boxes, for collision tests. */
function segments(line: Line | null): Box[] {
  if(!line) return []
  return line.slice(1).map(([x, y], i) => {
    const [px, py] = line[i]
    return {left: Math.min(x, px) - 1, right: Math.max(x, px) + 1, top: Math.min(y, py) - 1, bottom: Math.max(y, py) + 1}
  })
}

/**
 * The ways to connect a label to its element: null if the label touches or
 * overlaps the element, one straight line if the two are aligned, otherwise
 * the two right-angled lines, one that enters the element from above or below
 * and one that enters it from the side.
 */
function routes(box: Box, target: Box): Line[] | null {
  const dx = Math.max(target.left - box.right, box.left - target.right, 0)
  const dy = Math.max(target.top - box.bottom, box.top - target.bottom, 0)
  if(dx === 0 && dy === 0) return null
  if(dx === 0) {
    if(dy <= GAP + 1) return null
    const x = clamp(clamp(centreX(target), box.left + 3, box.right - 3), target.left, target.right)
    return [
      box.top > target.bottom
        ? [
            [x, target.bottom],
            [x, box.top],
          ]
        : [
            [x, target.top],
            [x, box.bottom],
          ],
    ]
  }
  if(dy === 0) {
    if(dx <= GAP + 1) return null
    const y = clamp(clamp(centreY(target), box.top + 3, box.bottom - 3), target.top, target.bottom)
    return [
      box.left > target.right
        ? [
            [target.right, y],
            [box.left, y],
          ]
        : [
            [target.left, y],
            [box.right, y],
          ],
    ]
  }
  const [tx, ty, bx, by] = [centreX(target), centreY(target), centreX(box), centreY(box)]
  return [
    [
      [tx, by < target.top ? target.top : target.bottom],
      [tx, by],
      [box.left > tx ? box.left : box.right, by],
    ],
    [
      [bx < target.left ? target.left : target.right, ty],
      [bx, ty],
      [bx, box.top > ty ? box.top : box.bottom],
    ],
  ]
}

/**
 * The connector from an element to its label: none if the label touches or
 * overlaps the element, a straight line if the two are aligned, otherwise a
 * right-angled line that leaves the element upwards or downwards and turns
 * towards the label.
 */
export function connector(box: Box, target: Box): Line | null {
  return routes(box, target)?.[0] ?? null
}

/** Next to the element on one side, centred, and pushed along the edge to stay inside the bounds. */
function adjacent(item: LabelItem, side: Side, bounds: Box): Box {
  const t = item.target
  if(upright(side)) {
    const left = clamp(centreX(t) - item.width / 2, bounds.left, bounds.right - item.width)
    return boxAt(left, side === "top" ? t.top - GAP - item.height : t.bottom + GAP, item)
  }
  const top = clamp(centreY(t) - item.height / 2, bounds.top, bounds.bottom - item.height)
  return boxAt(side === "left" ? t.left - GAP - item.width : t.right + GAP, top, item)
}

/** Positions farther out on one side: `step` rows or columns away, centred or hooked on either end. */
function distant(item: LabelItem, side: Side, step: number, bounds: Box): Box[] {
  const t = item.target
  if(upright(side)) {
    const far = RISE + (step - 1) * (item.height + GAP)
    const top = side === "top" ? t.top - far - item.height : t.bottom + far
    return [centreX(t) - item.width / 2, centreX(t) - HOOK, centreX(t) + HOOK - item.width].map(left => boxAt(clamp(left, bounds.left, bounds.right - item.width), top, item))
  }
  const far = RISE + (step - 1) * 24
  const left = side === "left" ? t.left - far - item.width : t.right + far
  return [centreY(t) - item.height / 2, t.top - GAP - item.height, t.bottom + GAP].map(top => boxAt(left, clamp(top, bounds.top, bounds.bottom - item.height), item))
}

/** Positions inside a region: the centre first, then the edges and corners, then the places in between. */
function interior(item: LabelItem, bounds: Box): Box[] {
  const t = item.target
  const [left, right] = [t.left + GAP, t.right - GAP - item.width]
  const [top, bottom] = [t.top + GAP, t.bottom - GAP - item.height]
  const spread = (from: number, to: number) => [(from + to) / 2, from, to, from + (to - from) / 4, to - (to - from) / 4]
  return spread(top, bottom).flatMap(y =>
    spread(left, right).map(x => boxAt(clamp(x, bounds.left, bounds.right - item.width), clamp(y, bounds.top, bounds.bottom - item.height), item)),
  )
}

/** Labels that are placed together: one label, or the labels of crowded neighbours on their shared side. */
type Unit = {members: number[]; side: Side | null}

/**
 * Places every label, or returns null if they do not all fit. A label never
 * covers another label, a connector or another marked element, except regions
 * and the elements around or inside its own. Connectors do not cross.
 *
 * 1. A label stays next to its element where that is free.
 * 2. Elements in a row whose labels would cover each other get a staircase
 *    below or above the row: every label on a line of its own, hooked on a
 *    straight connector, ordered so that no connector crosses a label. The
 *    labels reach towards the side that has room. In a row with no room on
 *    either side they fan out to both: the labels of the left part reach
 *    left, those of the right part reach right, and connectors that have to
 *    make way first run sideways just beyond the row.
 * 3. Elements in a column whose labels would cover each other get a stack
 *    beside the column, in the same order, each label joined to its element
 *    by a connector that steps out sideways.
 * 4. Any other label that is not free moves farther out, with a connector.
 *
 * The labels are placed in the order given. If one of them finds no place,
 * the ones placed before it try their next position.
 */
export function layoutLabels(bounds: Box, items: LabelItem[], avoid: Box[] = []): LabelPlacement[] | null {
  const done: (LabelPlacement | undefined)[] = items.map(() => undefined)
  /** The connector of each placed label as thin boxes. */
  const drawn: Box[][] = items.map(() => [])
  const blockers = items.map((item, i) => [
    ...items.filter((other, j) => j !== i && !other.region && !inside(item.target, other.target) && !inside(other.target, item.target)).map(other => other.target),
    ...avoid,
  ])
  const allowed = (i: number, box: Box) => inside(box, bounds) && !blockers[i].some(other => overlaps(box, other))
  /** True if a box touches neither a placed label nor a placed connector. */
  const vacant = (i: number, box: Box) => done.every((other, j) => !other || j === i || (!overlaps(box, other.box) && !drawn[j].some(part => overlaps(box, part))))
  const free = (i: number, box: Box) => allowed(i, box) && vacant(i, box)
  const unblocked = (i: number, parts: Box[]) => parts.every(part => !blockers[i].some(other => overlaps(part, other)))
  /** Places a label if its box is free and one of its connectors crosses nothing. */
  const put = (i: number, box: Box, lines: Line[] | null, css = false): boolean => {
    if(!free(i, box)) return false
    let line: Line | null = null
    let parts: Box[] = []
    if(lines) {
      const found = lines.find(each => {
        parts = segments(each)
        return unblocked(i, parts) && parts.every(part => vacant(i, part))
      })
      if(!found) return false
      line = found
    }
    done[i] = {box, line, css}
    drawn[i] = line ? parts : []
    return true
  }

  // Where each label would sit if it were alone.
  const ideal = items.map((item, i): {box: Box; css: boolean; side: Side} | null => {
    if(item.region) return null
    const sideOf = (box: Box): Side => (box.top >= item.target.bottom ? "bottom" : box.bottom <= item.target.top ? "top" : box.left >= item.target.right ? "right" : "left")
    if(item.css && allowed(i, item.css) && !routes(item.css, item.target)) return {box: item.css, css: true, side: sideOf(item.css)}
    for(const side of item.sides) {
      const box = adjacent(item, side, bounds)
      if(allowed(i, box) && !routes(box, item.target)) return {box, css: false, side}
    }
    return null
  })

  // Neighbours whose labels would cover each other on the same side form a group.
  const group = items.map((_, i) => i)
  const join = (i: number, j: number) => {
    const [from, to] = [group[Math.max(i, j)], group[Math.min(i, j)]]
    for(let k = 0; k < group.length; k++) if(group[k] === from) group[k] = to
  }
  for(let i = 0; i < items.length; i++) {
    for(let j = i + 1; j < items.length; j++) {
      const [a, b] = [ideal[i], ideal[j]]
      if(a && b && a.side === b.side && overlaps(a.box, b.box)) join(i, j)
    }
  }
  // An element in the same row or column whose label has no place of its own there joins them:
  // the first button of a toolbar above a column of tools, for example.
  const aligned = (a: Box, b: Box, side: Side) => {
    const [from, to, size] = upright(side)
      ? [Math.max(a.top, b.top), Math.min(a.bottom, b.bottom), Math.min(a.bottom - a.top, b.bottom - b.top)]
      : [Math.max(a.left, b.left), Math.min(a.right, b.right), Math.min(a.right - a.left, b.right - b.left)]
    return to - from >= size / 2
  }
  for(let i = 0; i < items.length; i++) {
    if(items[i].region || group.filter(g => g === group[i]).length > 1) continue
    for(let j = 0; j < items.length; j++) {
      const other = ideal[j]
      if(j === i || !other || other.side === ideal[i]?.side || !aligned(items[i].target, items[j].target, other.side)) continue
      if(!overlaps(adjacent(items[i], other.side, bounds), other.box)) continue
      join(i, j)
      break
    }
  }
  const units: Unit[] = []
  for(let i = 0; i < items.length; i++) {
    if(group[i] !== i) continue
    const members = group.flatMap((g, j) => (g === i ? [j] : []))
    // The side most of the members would take.
    const sides = members.flatMap(member => ideal[member]?.side ?? [])
    const side = SIDES.reduce((best, each) => (sides.filter(s => s === each).length > sides.filter(s => s === best).length ? each : best), sides[0])
    units.push({members, side: members.length > 1 ? side : null})
  }

  /** The room each element and its label will take at least: beside a column, the lanes of its connectors and its widest label. */
  const claims = items.map((item, i): Box => {
    const unit = units.find(each => each.members.includes(i))!
    const wish = ideal[i]?.box ?? item.target
    const claim = {
      left: Math.min(item.target.left, wish.left),
      top: Math.min(item.target.top, wish.top),
      right: Math.max(item.target.right, wish.right),
      bottom: Math.max(item.target.bottom, wish.bottom),
    }
    if(!unit.side || upright(unit.side)) return claim
    const reach = GAP + (unit.members.length - 1) * LANE + GAP + Math.max(...unit.members.map(member => items[member].width))
    if(unit.side === "right") claim.right = Math.max(claim.right, Math.max(...unit.members.map(member => items[member].target.right)) + reach)
    else claim.left = Math.min(claim.left, Math.min(...unit.members.map(member => items[member].target.left)) - reach)
    return claim
  })

  type Spot = {box: Box; lines: Line[] | null; css: boolean}
  /** The positions of one label on its own that nothing rules out from the start: touching its element, and farther out. Worked out when first needed. */
  const spots = new Map<number, {near?: Spot[]; far?: Spot[]}>()
  const near = (i: number): Spot[] => {
    const item = items[i]
    const all: Spot[] = []
    if(item.region) {
      // Inside the element: where CSS put it, the centre, the edges and corners.
      if(item.css && inside(item.css, item.target)) all.push({box: item.css, lines: null, css: true})
      for(const box of interior(item, bounds)) all.push({box, lines: null, css: false})
    } else {
      // Where CSS put it, then next to the element on each side.
      const first = ideal[i]
      if(first) all.push({box: first.box, lines: null, css: first.css})
      for(const side of item.sides) {
        const box = adjacent(item, side, bounds)
        if(!routes(box, item.target)) all.push({box, lines: null, css: false})
      }
    }
    return all.filter(({box}) => allowed(i, box))
  }
  const far = (i: number): Spot[] => {
    const item = items[i]
    const all: Spot[] = []
    for(let step = 1; step <= 8 && !item.region; step++) {
      for(const side of item.sides) {
        for(const box of distant(item, side, step, bounds)) {
          if(!allowed(i, box)) continue
          const lines = routes(box, item.target)?.filter(line => unblocked(i, segments(line)))
          if(lines?.length) all.push({box, lines, css: false})
        }
      }
    }
    return all
  }
  function* single(i: number): Generator<() => boolean> {
    const known = spots.get(i) ?? spots.set(i, {}).get(i)!
    for(const {box, lines, css} of (known.near ??= near(i))) yield () => put(i, box, lines, css)
    for(const {box, lines, css} of (known.far ??= far(i))) yield () => put(i, box, lines, css)
  }

  /**
   * A staircase under (or over) a row. The first `split` labels from the left
   * reach left and take their lines from the left; the others reach right and
   * take theirs from the right. Each label hangs on the place where its
   * connector comes down. That is the element's centre where the label has
   * room there; otherwise the connector first runs sideways, just beyond the
   * row, in a lane of its own.
   *
   * Elements beyond the row at the left or right edge, such as a column of
   * tools, need the room beside them for their own labels. Where they exist,
   * the staircase is also tried in the band that leaves them out.
   */
  function* staircase(members: number[], side: Side): Generator<() => boolean> {
    const sorted = [...members].sort((a, b) => centreX(items[a].target) - centreX(items[b].target))
    const count = sorted.length
    const down = side === "bottom"
    const sign = down ? 1 : -1
    const edge = down ? Math.max(...sorted.map(j => items[j].target.bottom)) : Math.min(...sorted.map(j => items[j].target.top))
    const row = Math.max(...sorted.map(j => items[j].height)) + GAP
    const centres = sorted.map(j => centreX(items[j].target))
    const widths = sorted.map(j => items[j].width)
    const leftish = centres.reduce((sum, x) => sum + x, 0) / count < centreX(bounds)

    const zones = items.flatMap((other, j) =>
      members.includes(j) || other.region || !(down ? other.target.top >= edge - SLACK : other.target.bottom <= edge + SLACK) ? [] : [claims[j]],
    )
    const margin = 4 * GAP
    const cutLeft = Math.max(bounds.left, ...zones.filter(zone => zone.left <= bounds.left + margin).map(zone => zone.right + GAP))
    const cutRight = Math.min(bounds.right, ...zones.filter(zone => zone.right >= bounds.right - margin).map(zone => zone.left - GAP))
    // The whole width last: with something in the way it is the least likely to work.
    const bands = [
      [cutLeft, bounds.right],
      [bounds.left, cutRight],
      [cutLeft, cutRight],
      [bounds.left, bounds.right],
    ].filter(([left, right], i, all) => right - left > 0 && all.findIndex(other => other[0] === left && other[1] === right) === i)

    type Plan = {split: number; drops: number[]; jogs: number; detour: number; band: number}
    const plans: Plan[] = []
    bands.forEach(([left, right], band) => {
      for(let split = 0; split <= count; split++) {
        // Where each connector may come down so that its label stays inside the band, and keeps its distance from the next.
        const apart = (i: number) => (i === split ? 2 * HOOK + GAP : SPREAD)
        const low = centres.map((_, i) => (i < split ? left + widths[i] - HOOK : left + HOOK))
        const high = centres.map((_, i) => (i < split ? right - HOOK : right - widths[i] + HOOK))
        for(let i = 1; i < count; i++) low[i] = Math.max(low[i], low[i - 1] + apart(i))
        for(let i = count - 2; i >= 0; i--) high[i] = Math.min(high[i], high[i + 1] - apart(i + 1))
        if(low.some((x, i) => x > high[i] + SLACK)) continue
        const drops: number[] = []
        for(let i = 0; i < count; i++) drops[i] = clamp(Math.max(centres[i], i > 0 ? drops[i - 1] + apart(i) : -Infinity), low[i], high[i])
        if(plans.some(plan => plan.split === split && plan.drops.every((x, i) => Math.abs(x - drops[i]) <= SLACK))) continue
        const detours = drops.map((x, i) => Math.abs(x - centres[i]))
        plans.push({split, drops, jogs: detours.filter(detour => detour > SLACK).length, detour: detours.reduce((sum, detour) => sum + detour, 0), band})
      }
    })
    // Straight connectors first. Then, band by band, the fewest lines of labels; a tie goes to the side with more room.
    const lines = (plan: Plan) => Math.max(plan.split, count - plan.split)
    const bent = (plan: Plan) => Number(plan.jogs > 0)
    plans.sort(
      (a, b) =>
        bent(a) - bent(b) || bent(a) * (a.band - b.band) || lines(a) - lines(b) || a.jogs - b.jogs || (leftish ? a.split - b.split : b.split - a.split) || a.detour - b.detour,
    )

    for(const {split, drops} of plans) {
      yield () => {
        // Connectors that run to the right keep clear of each other if the leftmost runs deepest; those that run to the left, if the rightmost does.
        const rightward = drops.map((x, i) => x - centres[i] > SLACK)
        const leftward = drops.map((x, i) => centres[i] - x > SLACK)
        const lanes = Math.max(rightward.filter(Boolean).length, leftward.filter(Boolean).length)
        const depth = drops.map((_, i) => (rightward[i] ? rightward.slice(i + 1).filter(Boolean).length : leftward.slice(0, i).filter(Boolean).length))
        const first = edge + sign * Math.max(RISE, lanes > 0 ? GAP + lanes * LANE + GAP : 0)
        const steps = [0, 0]
        // Outermost first: they take the nearest lines.
        const order = [...sorted.keys()].sort((a, b) => (a < split ? a : count - 1 - a) - (b < split ? b : count - 1 - b))
        for(const i of order) {
          const item = items[sorted[i]]
          const part = i < split ? 0 : 1
          const left = part === 0 ? drops[i] + HOOK - item.width : drops[i] - HOOK
          const bend = edge + sign * (GAP + depth[i] * LANE)
          for(;;) {
            const near = first + sign * steps[part]++ * row
            const box = boxAt(left, down ? near : near - item.height, item)
            if(box.top < bounds.top - SLACK || box.bottom > bounds.bottom + SLACK) return false
            const from: [number, number] = [centres[i], down ? item.target.bottom : item.target.top]
            const line: Line = rightward[i] || leftward[i] ? [from, [centres[i], bend], [drops[i], bend], [drops[i], near]] : [from, [centres[i], near]]
            if(put(sorted[i], box, [line])) break
          }
        }
        return true
      }
    }
  }

  /**
   * A stack beside a column: the labels one under the other in the order of
   * their elements, as near to them as their heights allow. A label that ends
   * up beside its element gets a straight connector or none; the others get
   * one that steps out sideways, each in a lane of its own.
   */
  function* stack(members: number[], side: Side): Generator<() => boolean> {
    const sorted = [...members].sort((a, b) => centreY(items[a].target) - centreY(items[b].target))
    const [head, tail] = [items[sorted[0]], items[sorted[sorted.length - 1]]]
    const total = sorted.reduce((sum, j) => sum + items[j].height, 0) + STACK * (sorted.length - 1)
    if(total > bounds.bottom - bounds.top) return
    const wanted = (centreY(head.target) - head.height / 2 + centreY(tail.target) + tail.height / 2) / 2 - total / 2
    const pitch = total / sorted.length
    // Centred on the column first, then a little lower or higher, where something else is in the way.
    const starts = new Set([0, 0.5, -0.5, 1, -1, 2, -2].map(shift => clamp(wanted + shift * pitch, bounds.top, bounds.bottom - total)))
    for(const start of starts) yield* stackAt(sorted, side, start)
  }

  function* stackAt(sorted: number[], side: Side, start: number): Generator<() => boolean> {
    const tops: number[] = []
    let top = start
    for(const j of sorted) {
      tops.push(top)
      top += items[j].height + STACK
    }
    const right = side === "right"
    const sign = right ? 1 : -1
    const edge = right ? Math.max(...sorted.map(j => items[j].target.right)) : Math.min(...sorted.map(j => items[j].target.left))
    // A label whose height does not reach the height of its element is joined around the corner.
    const reach = sorted.map((j, i) => Math.min(items[j].target.bottom, tops[i] + items[j].height - 3) - Math.max(items[j].target.top, tops[i] + 3))
    const jogged = reach.map(overlap => overlap < 0)
    // Labels above their elements count their lanes from the top, labels below from the bottom: then no connector crosses another.
    const above = sorted.map((j, i) => tops[i] + items[j].height / 2 < centreY(items[j].target))
    const lane = sorted.map(() => -1)
    const lanes = [0, 0]
    for(let i = 0; i < sorted.length; i++) if(jogged[i] && above[i]) lane[i] = lanes[0]++
    for(let i = sorted.length - 1; i >= 0; i--) if(jogged[i] && !above[i]) lane[i] = lanes[1]++
    const offset = Math.max(...lanes) > 0 ? GAP + Math.max(...lanes) * LANE + GAP : GAP

    yield () => {
      for(const [i, j] of sorted.entries()) {
        const item = items[j]
        const box = boxAt(right ? edge + offset : edge - offset - item.width, tops[i], item)
        const [from, to] = right ? [item.target.right, box.left] : [item.target.left, box.right]
        let lines: Line[] | null = null
        if(jogged[i]) {
          const bend = edge + sign * (GAP + lane[i] * LANE)
          lines = [
            [
              [from, centreY(item.target)],
              [bend, centreY(item.target)],
              [bend, centreY(box)],
              [to, centreY(box)],
            ],
          ]
        } else if(Math.abs(to - from) > GAP + 1) {
          const y = clamp(clamp(centreY(item.target), box.top + 3, box.bottom - 3), item.target.top, item.target.bottom)
          lines = [
            [
              [from, y],
              [to, y],
            ],
          ]
        }
        if(!put(j, box, lines)) return false
      }
      return true
    }
  }

  function* candidates(unit: Unit): Generator<() => boolean> {
    if(!unit.side) yield* single(unit.members[0])
    else if(upright(unit.side)) {
      yield* staircase(unit.members, unit.side)
      yield* staircase(unit.members, OPPOSITE[unit.side])
    } else {
      yield* stack(unit.members, unit.side)
      yield* stack(unit.members, OPPOSITE[unit.side])
    }
  }

  let budget = BUDGET
  const solve = (queue: Unit[], index: number): boolean => {
    if(index === queue.length) return true
    const unit = queue[index]
    const reset = () => unit.members.forEach(member => (done[member] = undefined))
    for(const place of candidates(unit)) {
      if(budget-- <= 0) return false
      if(place() && solve(queue, index + 1)) return true
      reset()
    }
    // A group that fits nowhere as a whole: each of its labels on its own.
    if(unit.members.length === 1 || budget <= 0) return false
    return solve([...queue.slice(0, index), ...unit.members.map(member => ({members: [member], side: null})), ...queue.slice(index + 1)], index)
  }
  return solve(units, 0) ? (done as LabelPlacement[]) : null
}
