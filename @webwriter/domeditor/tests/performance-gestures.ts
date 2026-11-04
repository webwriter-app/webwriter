import {DomEditor} from '../src/components/dom-editor'
import type {DOMEditor} from '../src/domeditor'
import type {EditorStateSnapshot} from '../src/editor-state'

type Mode = 'document' | 'canvas' | 'slides' | 'board'
type Operation = 'resize' | 'move' | 'rotate' | 'group-resize' | 'group-rotate'
  | 'card-resize' | 'column-resize' | 'text-drop' | 'float-drop' | 'board-drop' | 'svg-resize' | 'table-resize'
type Case = {name: string, mode: Mode, operation: Operation, variant?: string}
type Point = {x: number, y: number}
type Counters = Record<string, number>

const cases: Case[] = [
  {name: 'document resize', mode: 'document', operation: 'resize'},
  {name: 'canvas resize', mode: 'canvas', operation: 'resize'},
  {name: 'slides resize', mode: 'slides', operation: 'resize'},
  {name: 'board card resize', mode: 'board', operation: 'card-resize'},
  {name: 'board column resize', mode: 'board', operation: 'column-resize'},
  {name: 'canvas move', mode: 'canvas', operation: 'move'},
  {name: 'slides move', mode: 'slides', operation: 'move'},
  {name: 'canvas group resize', mode: 'canvas', operation: 'group-resize'},
  {name: 'canvas group rotate', mode: 'canvas', operation: 'group-rotate'},
  {name: 'canvas rotate', mode: 'canvas', operation: 'rotate'},
  {name: 'canvas rotate with figures', mode: 'canvas', operation: 'rotate', variant: 'figures'},
  {name: 'document text drop', mode: 'document', operation: 'text-drop'},
  {name: 'document float drop', mode: 'document', operation: 'float-drop'},
  {name: 'board card drop', mode: 'board', operation: 'board-drop'},
  {name: 'svg resize', mode: 'document', operation: 'svg-resize'},
  {name: 'svg rich label resize first widths', mode: 'document', operation: 'svg-resize', variant: 'first'},
  {name: 'svg rich label resize repeat widths', mode: 'document', operation: 'svg-resize', variant: 'repeat'},
  {name: 'table column resize 30 rows', mode: 'document', operation: 'table-resize', variant: '30'},
  {name: 'table column resize 300 rows', mode: 'document', operation: 'table-resize', variant: '300'},
]

function gestureHTML({operation, variant}: Case, base: string) {
  if(operation === 'text-drop') return '<p id="drag-source" style="width:320px">Sample text to move</p>'
    + '<p id="drop-target" style="width:650px">This is the destination text with several words for the drop caret to follow.</p>' + base
  if(operation === 'float-drop') return '<p id="drag-source" style="width:200px;height:55px">Sample float source</p>'
    + '<p id="drop-target" style="min-height:100px">This paragraph anchors the float preview.</p>' + base
  if(operation === 'svg-resize') return '<div id="graphic-position"></div>' + base
  if(operation === 'table-resize') return '<table style="width:720px;table-layout:fixed"><tbody>'
    + Array.from({length: Number(variant)}, (_, i) => '<tr>'
      + Array.from({length: 6}, (_, j) => `<td>Cell ${i}, ${j}</td>`).join('') + '</tr>').join('') + '</tbody></table>'
  if(operation.startsWith('group-')) return base + Array.from({length: 12}, (_, i) =>
    `<p id="group-${i}" data-ww-group="benchmark" style="position:absolute;left:${360 + i % 4 * 125}px;top:${90 + Math.floor(i / 4) * 70}px;width:100px;height:50px;background:#dbeafe">Item ${i}</p>`).join('')
  if(variant === 'figures') return base + Array.from({length: 60}, (_, i) =>
    `<figure style="position:absolute;left:${600 + i % 6 * 160}px;top:${200 + Math.floor(i / 6) * 120}px;width:130px"><div style="width:64px;height:48px;rotate:15deg;background:#dbeafe"></div><figcaption>Caption ${i} with editable text</figcaption></figure>`).join('')
  return base
}

// Serialized to the frame's DevTools execution context. Keep all dependencies
// inside the function so the fixture can use the live DOM across the two origins.
function installGestureFixture({operation, variant, name}: Case) {
  const editor = (window as Window & {editor: DOMEditor}).editor
  editor.doc.disconnectCollaboration()
  const need = <T>(value: T | null | undefined | false, message: string): T => {
    if(value == null || value === false) throw new Error(`${name}: ${message}`)
    return value
  }
  const node = <T extends Element = HTMLElement>(selector: string) => need(document.querySelector<T>(selector), `missing ${selector}`)
  const {board, graphic, manipulation, selection, transformation} = editor.features
  let source: Element | null = null, expected: Element | null = null, before = '', sample = 0, labelPrefix = ''
  const counts: Counters = {}
  const add = (key: string, n = 1) => { counts[key] = (counts[key] ?? 0) + n }
  const wrap = <T, K extends keyof T>(object: T, key: K, counter = String(key)) => {
    const original = object[key]
    if(typeof original !== 'function') return
    object[key] = function(this: unknown, ...args: unknown[]) {
      add(counter)
      return Reflect.apply(original, this, args)
    } as T[K]
  }
  wrap(transformation, 'updateInfo')
  wrap(transformation, 'handleScaleDrag')
  wrap(transformation, 'handleMoveDrag')
  wrap(transformation, 'handleRotateDrag')
  wrap(editor.features.layout, 'refresh', 'layout.refresh')
  wrap(selection, 'processSelection')
  wrap(editor.doc, 'syncFromDOM')
  wrap(editor, 'postSelectionPath')
  if(operation === 'svg-resize') {
    for(const method of ['getSubStringLength', 'getStartPositionOfChar', 'getEndPositionOfChar'] as const) wrap(SVGTextElement.prototype, method)
    wrap(SVGGraphicsElement.prototype, 'getBBox')
  }
  for(const type of ['pointermove', 'dragstart', 'dragover', 'drop']) window.addEventListener(type, event => {
    if(event.isTrusted) add(type)
  }, true)
  const input: object[] = []
  for(const type of ['pointerdown', 'gotpointercapture', 'lostpointercapture', 'pointercancel', 'pointerup', 'blur']) {
    window.addEventListener(type, event => {
      const origin = event.composedPath()[0]
      const pointer = event as PointerEvent
      input.push({type, id: origin instanceof Element ? origin.id || origin.getAttribute('part') : null,
        x: pointer.clientX, y: pointer.clientY, pointer: pointer.pointerId, buttons: pointer.buttons})
    }, true)
  }
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
  const center = (element: Element) => {
    const rect = element.getBoundingClientRect()
    need(rect.width > 0 && rect.height > 0, `control has no box (${element.outerHTML.slice(0, 180)})`)
    return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}
  }
  const phase = (name: string, boundary: 'start' | 'end') => {
    performance.mark(`gesture:${name}:${boundary}`)
    return {...counts}
  }

  if(operation === 'svg-resize') {
    const placeholder = node('#graphic-position')
    const svg = graphic.createGraphic()
    svg.id = 'benchmark-svg'
    svg.setAttribute('viewBox', '0 0 800 500')
    Object.assign(svg.style, {width: '800px', height: '500px'})
    placeholder.replaceWith(svg)
    selection.captureElement(svg)
    graphic.actions.addGraphicShape({type: 'addGraphicShape', shape: 'rectangle'})
    graphic.actions.setGraphicParameter({type: 'setGraphicParameter', name: 'width', value: '280'})
    graphic.actions.setGraphicParameter({type: 'setGraphicParameter', name: 'height', value: '160'})
    if(variant) {
      graphic.actions.setGraphicParameter({type: 'setGraphicParameter', name: 'label', value: 'Benchmark label'})
      const label = svg.querySelector('text')!
      const text = 'A long label with naïve café, 👩‍💻, مرحبًا بالعالم, 漢字, and several words for wrapping. '.repeat(5)
      const run = document.createElementNS(svg.namespaceURI, 'tspan')
      run.setAttribute('font-weight', '700')
      run.textContent = text.slice(150)
      labelPrefix = text.slice(0, 150)
      label.replaceChildren(labelPrefix, run)
    }
    editor.doc.syncFromDOM()
  }

  return {
    frame, phase,
    async select() {
      window.scrollTo(0, 0)
      if(operation.startsWith('group-')) {
        selection.selectElement(node('#profile-transform'))
        await frame()
        return center(node('#group-1'))
      }
      if(operation === 'svg-resize') {
        const svg = node<SVGSVGElement>('#benchmark-svg')
        selection.captureElement(svg)
        if(variant === 'first') {
          const text = svg.querySelector('text')!
          text.firstChild!.textContent = `${++sample} ${labelPrefix}`
          graphic.refresh()
        }
        await frame()
        const shape = need(svg.querySelector<SVGGraphicsElement>('g, rect, path'), 'missing test shape')
        // Keep the fixture's selection path identical for all three SVG cases.
        if(!graphic.selectedShapes.includes(shape)) return center(shape)
        return null
      }
      if(operation !== 'table-resize') {
        const target = operation === 'board-drop' || operation === 'card-resize' ? board.cards(board.columns()[0])[0]
          : operation === 'column-resize' ? board.columns()[0]
          : node(operation.endsWith('-drop') ? '#drag-source' : '#profile-transform')
        selection.withoutSelectionScroll(() => selection.selectElement(target))
      }
      await frame()
      return null
    },
    async plan() {
      await frame()
      const handle = (selector: string, root: ParentNode = editor.appendix) =>
        need(Array.from(root.querySelectorAll<HTMLElement>(selector)).find(item => !item.hidden), `missing control ${selector}`)
      let from: Point, to: Point
      if(operation === 'text-drop' || operation === 'float-drop') {
        source = node('#drag-source'); expected = node('#drop-target')
        const surface = handle('[part~="node-drag-surface"]').getBoundingClientRect()
        from = {x: surface.left + 2, y: surface.top + surface.height / 2}
        if(operation === 'float-drop') {
          manipulation.showFloatDropPreview(expected, 'left', 'transfer', source)
          to = center(handle('[id="◆float-drop-preview"]'))
          manipulation.clearFloatDropPreview('transfer')
        }
        else {
          const rect = expected.getBoundingClientRect()
          to = {x: rect.left + 180, y: rect.top + Math.min(12, rect.height / 2)}
        }
      }
      else if(operation === 'board-drop' || operation === 'card-resize' || operation === 'column-resize') {
        const [first, second] = board.columns()
        source = operation === 'column-resize' ? first : board.cards(first)[0]
        const overlay = need(board.transformOverlay(source as HTMLElement), 'missing Board overlay')
        const control = handle(operation === 'board-drop' ? '[part~="transform-overlay-mover"]' : '[data-transform-mode="scale"]', overlay)
        from = center(control)
        if(operation === 'column-resize' && from.y >= innerHeight - 15) {
          window.scrollBy({top: from.y - innerHeight / 2, behavior: 'instant'})
          await frame()
          from = center(control)
        }
        if(operation === 'board-drop') {
          expected = second
          const cards = board.cards(second)
          const lastVisible = need(cards.filter(card => card.getBoundingClientRect().bottom < innerHeight - 15).at(-1),
            'no visible card in the destination column')
          to = center(lastVisible)
          to.y += 6
        }
        else to = operation === 'column-resize' ? {x: from.x + 100, y: from.y} : {x: from.x, y: from.y + 100}
      }
      else if(operation === 'table-resize') {
        source = node('td')
        const rect = source.getBoundingClientRect()
        from = {x: rect.right - 2, y: rect.top + rect.height / 2}
        to = {x: from.x + 75, y: from.y}
      }
      else if(operation === 'svg-resize') {
        source = need(graphic.selectedShapes[0], 'shape was not selected')
        from = center(handle('[data-graphic-handle="resize-e"]'))
        to = {x: from.x - 90, y: from.y}
      }
      else {
        source = need(transformation.target, 'no transform target')
        if(operation.startsWith('group-')) need(source.id.startsWith('group-'), 'group was not selected')
        const overlay = transformation.overlay
        if(operation.includes('rotate')) {
          from = center(handle('[data-transform-mode="rotate"]', overlay))
          const pivot = center(overlay)
          to = {x: pivot.x + Math.max(100, Math.abs(from.y - pivot.y)), y: pivot.y + 15}
        }
        else if(operation === 'move') {
          const edge = handle('[data-transform-mode="move"].◆transform-overlay-edge[data-resize-direction="right"]', overlay).getBoundingClientRect()
          // The midpoint resize button overlaps the center of the move edge.
          from = {x: edge.left + edge.width / 2, y: edge.top + edge.height / 4}
          to = {x: from.x + 110, y: from.y + 50}
        }
        else {
          from = center(handle('[data-transform-mode="scale"][data-resize-direction*="right"]', overlay))
          to = {x: from.x + (operation === 'resize' && !editor.features.canvas.active && !editor.features.slides.active ? -100 : 100), y: from.y + 35}
        }
      }
      before = operation === 'svg-resize' ? source.innerHTML + (source.getAttribute('d') ?? '')
        + (source.getAttribute('width') ?? '') : operation === 'text-drop' ? expected!.textContent! : source.getAttribute('style') ?? ''
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      for(const point of [from, to]) need(point.x >= 1 && point.x < innerWidth && point.y >= 1 && point.y < innerHeight,
        `point outside ${innerWidth}×${innerHeight} viewport: ${JSON.stringify(point)}`)
      return {from, to, viewport: [innerWidth, innerHeight]}
    },
    verify(trusted: Counters) {
      if(operation.endsWith('-drop')) need(Boolean(trusted.dragstart && trusted.dragover && trusted.drop),
        `incomplete native drag (${JSON.stringify(trusted)}; input ${JSON.stringify(input.slice(-12))})`)
      else need(trusted.pointermove >= 2, 'gesture did not dispatch trusted pointer movements')
      const handler = operation === 'move' ? 'handleMoveDrag' : operation.includes('rotate') ? 'handleRotateDrag'
        : operation.includes('resize') && operation !== 'table-resize' && operation !== 'svg-resize' ? 'handleScaleDrag' : null
      if(handler) need(trusted[handler] >= 2, `expected ${handler} (${JSON.stringify(trusted)}; input ${JSON.stringify(input.slice(-12))})`)
      const changed = operation === 'svg-resize' ? source!.innerHTML + (source!.getAttribute('d') ?? '') + (source!.getAttribute('width') ?? '') !== before
        : operation === 'board-drop' ? source!.parentElement === expected
        : operation === 'text-drop' ? expected!.textContent !== before && expected!.textContent!.includes('Sample text to move')
        : operation === 'float-drop' ? source!.matches('.ww-float-left, .ww-float-right')
        : (source!.getAttribute('style') ?? '') !== before
      need(changed, `gesture did not commit the expected DOM edit (${source!.outerHTML.slice(0, 240)}; input ${JSON.stringify(input.slice(-12))}; counts ${JSON.stringify(trusted)})`)
      if(operation === 'table-resize') need(Array.from(node<HTMLTableElement>('table').rows).every(row => row.cells[0].style.width),
        'column resize did not reach every row')
      if(operation.startsWith('group-')) need(node('#group-11').style[operation.includes('rotate') ? 'transform' : 'width'] !==
        (operation.includes('rotate') ? '' : '100px'), 'group transform did not reach the last member')
      editor.doc.undo()
    },
  }
}

type Stage = (name: string, details: object, run: () => Promise<void>, samples: number, batch: number, warmups: number) => Promise<object>
type Fixture = (mode: Mode, size: number) => {bodyClass: string, html: string}
type Stats = (values: number[]) => object

export async function gestureProfiles(stage: Stage, fixture: Fixture, snapshot: (html: string, bodyClass: string) => EditorStateSnapshot,
  statistics: Stats, profiling: boolean) {
  const token = location.hash.slice(1)
  const filters = new URLSearchParams(location.search).getAll('gesture')
  const unknown = filters.find(filter => !cases.some(test => test.name === filter))
  if(unknown) throw new Error(`Unknown gesture: ${unknown}`)
  const selected = cases.filter(test => !filters.length || filters.includes(test.name))
  const rpc = async <T>(data: object): Promise<T> => {
    const response = await fetch('/__native-gesture', {method: 'POST', headers: {'x-gesture-token': token}, body: JSON.stringify(data)})
    if(!response.ok) throw new Error(await response.text())
    return response.json()
  }
  const evaluate = async <T>(expression: string, revision?: number) => {
    try { return await rpc<T>({expression, revision}) }
    catch(error) { throw new Error(`Frame command ${expression.slice(0, 70)} failed`, {cause: error}) }
  }
  const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const steps = 18, pauseMs = 200, warmups = 2
  const failures: string[] = []
  for(const [index, test] of selected.entries()) {
    const base = fixture(test.mode, 600)
    const html = gestureHTML(test, base.html)
    const boardCSS = test.operation === 'board-drop'
      ? '<style>.ww-board-card {min-height:24px;height:24px;padding:0 4px}.ww-board-card p {margin:0;line-height:20px}</style>' : ''
    const app = new DomEditor()
    Object.assign(app, {
      frameStarted: true, frameRevision: index + 1,
      frameDocumentHTML: `<!doctype html><html><head>${boardCSS}</head><body class="${base.bodyClass}">${html}</body></html>`,
      frameState: snapshot(html, base.bodyClass),
      documentLayoutsDismissed: true, accessibilityReviewEnabled: false, packageCatalogRequested: true,
      settings: {...Reflect.get(app, 'settings'), showGuidedTour: false, proofreadingEnabledByDefault: false, disableAnimations: true},
      loginToBackend: async () => {},
    })
    Object.defineProperty(app, 'syncUrl', {value: 'ws://127.0.0.1:65534'})
    app.style.cssText = 'position:fixed;inset:0;width:100%;height:100%'
    document.body.append(app)
    try {
      let ready = false
      for(let attempt = 0; !ready && attempt < 200; attempt++) {
        ready = await evaluate<boolean>('Boolean(window.editor)', index + 1) === true
        if(!ready) await delay(50)
      }
      if(!ready) throw new Error(`${test.name}: editor frame did not start`)
      await evaluate(`window.gestureFixture = (${installGestureFixture.toString()})(${JSON.stringify(test)}); true`)
      await app.updateComplete
      const nativeDrag = test.operation.endsWith('-drop')
      const frame = app.shadowRoot!.querySelector<HTMLIFrameElement>('iframe.editor-frame')!
      let offset: Point = {x: 0, y: 0}
      const mouse = (type: string, point: Point, held = false) =>
        rpc({nativeDrag, mouse: {type, x: point.x + offset.x,
          y: point.y + offset.y, button: type === 'mouseMoved' && !held ? 'none' : 'left',
          buttons: held ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1}})
      const pickupSteps = nativeDrag ? 2 : 0
      const phaseNames = ['start', ...(pickupSteps ? ['pickup'] : []), 'move', 'pause', 'release', 'afterRelease']
      const times: Record<string, number[]> = Object.fromEntries(phaseNames.map(phase => [phase, []]))
      const counters: Record<string, Counters[]> = Object.fromEntries(phaseNames.map(phase => [phase, []]))
      const moveSteps: number[] = []
      let viewport: number[] = []
      const waitFrame = () => evaluate('window.gestureFixture.frame()')
      const check = await stage(test.name, {layout: test.mode, operation: test.operation, variant: test.variant,
        ...(test.operation === 'table-resize' ? {rows: Number(test.variant), columns: 6} : {textBlocks: 600}), steps, pauseMs}, async () => {
        const selection = await evaluate<Point | null>('window.gestureFixture.select()')
        if(selection) {
          await mouse('mouseMoved', selection)
          await mouse('mousePressed', selection, true)
          await mouse('mouseReleased', selection)
          await waitFrame()
        }
        const plan = await evaluate<{from: Point, to: Point, viewport: number[]}>('window.gestureFixture.plan()')
        if(nativeDrag) {
          const box = frame.getBoundingClientRect()
          offset = {x: box.left + frame.clientLeft, y: box.top + frame.clientTop}
        }
        viewport = plan.viewport
        const {from, to} = plan
        const path = Array.from({length: steps}, (_, i) => {
          const fraction = (i + 1) / steps
          return {x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction}
        })
        const point = path.at(-1)!, trusted: Counters = {}
        await mouse('mouseMoved', from)
        await waitFrame()
        const measure = async (phase: string, action: () => Promise<void>) => {
          const before = await evaluate<Counters>(`window.gestureFixture.phase('${phase}', 'start')`)
          const start = performance.now()
          await action()
          times[phase].push(performance.now() - start)
          const after = await evaluate<Counters>(`window.gestureFixture.phase('${phase}', 'end')`)
          const difference = Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - (before[key] ?? 0)]))
          counters[phase].push(difference)
          for(const [key, value] of Object.entries(difference)) trusted[key] = (trusted[key] ?? 0) + value
        }
        await measure('start', async () => { await mouse('mousePressed', from, true); await waitFrame() })
        const move = async (points: Point[], timed: boolean) => {
          for(const next of points) {
            const start = performance.now()
            await mouse('mouseMoved', next, true)
            await waitFrame()
            if(timed) moveSteps.push(performance.now() - start)
          }
        }
        if(pickupSteps) await measure('pickup', () => move(path.slice(0, pickupSteps), false))
        await measure('move', () => move(path.slice(pickupSteps, steps / 2), true))
        await measure('pause', () => delay(pauseMs))
        await measure('move', () => move(path.slice(steps / 2), true))
        await measure('release', async () => { await mouse('mouseReleased', point); await waitFrame() })
        // The frame bridge throttles authored snapshots to 250 ms.
        await measure('afterRelease', () => delay(275))
        await evaluate(`window.gestureFixture.verify(${JSON.stringify(trusted)}); true`)
        await waitFrame()
      }, profiling ? 3 : 6, 1, warmups)
      const phases = Object.fromEntries(Object.entries(times).map(([phase, values]) => {
        const perGesture = phase === 'move' ? 2 : 1
        const countsPerPhase = counters[phase].slice(warmups * perGesture)
        const keys = new Set(countsPerPhase.flatMap(counts => Object.keys(counts)))
        const durations = values.slice(warmups * perGesture)
        const samples = perGesture === 1 ? durations : durations.filter((_, index) => index % 2 === 0)
          .map((duration, index) => duration + durations[index * 2 + 1])
        return [phase, {timing: statistics(samples), counters: Object.fromEntries([...keys]
          .map(key => [key, countsPerPhase.reduce((sum, counts) => sum + (counts[key] ?? 0), 0)]))}]
      }))
      Object.assign(check, {viewport, moveStep: statistics(moveSteps.slice(warmups * (steps - pickupSteps))), phases})
    }
    catch(error) {
      const failure = `${test.name}: ${String(error)}${error instanceof Error && error.cause ? `\n  ${String(error.cause)}` : ''}`
      failures.push(failure)
      await fetch('/__native-progress', {method: 'POST', body: `FAILED ${failure}\n`})
    }
    finally { app.remove() }
  }
  if(failures.length) throw new Error(failures.join('\n'))
}
