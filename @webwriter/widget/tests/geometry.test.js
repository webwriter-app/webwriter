import {test} from "node:test"
import assert from "node:assert/strict"
import "./dom.js"

const scene = await import("../scene/geometry.js")
const drag = await import("../drag/geometry.js")
const {connector, layoutLabels} = await import("../help/layout.js")

const rect = (left, top, width, height) => ({left, top, width, height, right: left + width, bottom: top + height, x: left, y: top})

test("scene transforms convert points both ways and compose", () => {
  const view = {x: 10, y: 20, k: 2}
  assert.deepEqual(scene.apply(view, {x: 3, y: 4}), {x: 16, y: 28})
  assert.deepEqual(scene.invert(view, {x: 16, y: 28}), {x: 3, y: 4})
  assert.deepEqual(scene.apply(scene.IDENTITY, {x: 3, y: 4}), {x: 3, y: 4})
  const both = scene.compose(view, {x: 1, y: 1, k: 3})
  assert.deepEqual(both, {x: 12, y: 22, k: 6})
  assert.deepEqual(scene.apply(both, {x: 1, y: 0}), scene.apply(view, scene.apply({x: 1, y: 1, k: 3}, {x: 1, y: 0})))
  assert.equal(scene.snap(13, 5), 15)
  assert.equal(scene.snap(13, 0), 13)
})

test("scene routes give path data and the same line as points", () => {
  const a = {x: 0, y: 0}
  const b = {x: 100, y: 40}
  const right = {x: 1, y: 0}
  const left = {x: -1, y: 0}
  assert.deepEqual(scene.route(a, b, "straight", right, left), {d: "M0 0L100 40", points: [a, b]})
  assert.equal(scene.route(a, b, "step", right, left).d, "M0 0L50 0L50 40L100 40")
  assert.equal(scene.route(a, b, "step", {x: 0, y: 1}, {x: 0, y: -1}).d, "M0 0L0 20L100 20L100 40")
  const curve = scene.route(a, b, "curve", right, left)
  assert.match(curve.d, /^M0 0C/)
  assert.equal(curve.points.length, 17)
  assert.deepEqual(curve.points[0], a)
  assert.deepEqual(curve.points[16], b)
  assert.equal(scene.polyline([a, b, {x: 0, y: 40}], true), "M0 0L100 40L0 40Z")
})

test("scene hit tests work on boxes and polylines", () => {
  assert.deepEqual(scene.bounds([{x: 5, y: 1}, {x: -5, y: 9}]), {x: -5, y: 1, width: 10, height: 8})
  assert.equal(scene.bounds([]), null)
  assert.deepEqual(scene.corners({x: 0, y: 0, width: 2, height: 1}), [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 1}, {x: 0, y: 1}])
  const box = {x: 10, y: 10, width: 10, height: 10}
  assert.equal(scene.rectsIntersect(box, {x: 20, y: 20, width: 5, height: 5}), true)
  assert.equal(scene.rectsIntersect(box, {x: 21, y: 10, width: 5, height: 5}), false)
  // A segment that crosses the box without a point inside it.
  assert.equal(scene.polylineHitsRect([{x: 0, y: 15}, {x: 30, y: 15}], box), true)
  assert.equal(scene.polylineHitsRect([{x: 0, y: 0}, {x: 30, y: 5}], box), false)
  assert.equal(scene.polylineHitsRect([{x: 12, y: 12}], box), false)
  assert.equal(scene.distanceToPolyline([{x: 0, y: 0}, {x: 10, y: 0}], 5, 3), 3)
  assert.equal(scene.distanceToPolyline([{x: 0, y: 0}, {x: 10, y: 0}], 13, 4), 5)
  assert.equal(scene.distanceToPolyline([{x: 1, y: 1}], 4, 5), 5)
  assert.equal(scene.distanceToPolyline([], 0, 0), Infinity)
})

test("a drop index is found from the midpoints of stacked items", () => {
  const rects = [rect(0, 0, 100, 20), rect(0, 20, 100, 20), rect(0, 40, 100, 20)]
  const flow = drag.flowOf(document.body, rects)
  assert.deepEqual(flow, {inline: false, reverse: false})
  assert.deepEqual(drag.indexAt(flow, rects, 50, 5), {index: 0, trailing: false})
  assert.deepEqual(drag.indexAt(flow, rects, 50, 15), {index: 1, trailing: false})
  assert.deepEqual(drag.indexAt(flow, rects, 50, 49), {index: 2, trailing: false})
  assert.deepEqual(drag.indexAt(flow, rects, 50, 300), {index: 3, trailing: false})
  // The marker is a line in the gap between the neighbours, as wide as the items.
  assert.deepEqual(drag.markerBox(flow, rects, 1, false, rect(0, 0, 0, 0)), {left: 0, top: 19, width: 100, height: 2})
  assert.deepEqual(drag.markerBox(flow, rects, 3, false, rect(0, 0, 0, 0)), {left: 0, top: 59, width: 100, height: 2})
})

test("a drop index follows rows that wrap and rows that run right to left", () => {
  const rows = [rect(0, 0, 40, 20), rect(50, 0, 40, 20), rect(0, 30, 40, 20)]
  const flow = drag.flowOf(document.body, rows)
  assert.deepEqual(flow, {inline: true, reverse: false})
  assert.deepEqual(drag.indexAt(flow, rows, 10, 10), {index: 0, trailing: false})
  assert.deepEqual(drag.indexAt(flow, rows, 60, 10), {index: 1, trailing: false})
  // Behind the last item of the first row: the index of the next row's first item, at the end of this row.
  assert.deepEqual(drag.indexAt(flow, rows, 95, 10), {index: 2, trailing: true})
  assert.deepEqual(drag.indexAt(flow, rows, 10, 40), {index: 2, trailing: false})
  assert.deepEqual(drag.indexAt(flow, rows, 95, 40), {index: 3, trailing: false})
  assert.deepEqual(drag.markerBox(flow, rows, 1, false, rect(0, 0, 0, 0)), {left: 44, top: 0, width: 2, height: 20})
  assert.deepEqual(drag.markerBox(flow, rows, 2, true, rect(0, 0, 0, 0)), {left: 89, top: 0, width: 2, height: 20})
  const reversed = [rect(60, 0, 40, 20), rect(10, 0, 40, 20)]
  const rtl = drag.flowOf(document.body, reversed)
  assert.deepEqual(rtl, {inline: true, reverse: true})
  assert.deepEqual(drag.indexAt(rtl, reversed, 90, 10), {index: 0, trailing: false})
  assert.deepEqual(drag.indexAt(rtl, reversed, 40, 10), {index: 1, trailing: false})
  assert.deepEqual(drag.indexAt(rtl, reversed, 0, 10), {index: 2, trailing: false})
})

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

test("help labels are placed inside the bounds, clear of the elements and of each other", () => {
  const bounds = {left: 0, top: 0, right: 400, bottom: 300}
  const targets = [
    {left: 20, top: 20, right: 60, bottom: 44},
    {left: 70, top: 20, right: 110, bottom: 44},
    {left: 340, top: 250, right: 390, bottom: 280},
  ]
  const items = targets.map(target => ({target, width: 90, height: 24, sides: ["bottom", "top", "right", "left"], region: false}))
  const placed = layoutLabels(bounds, items)
  assert.equal(placed.length, 3)
  for(const [index, {box}] of placed.entries()) {
    assert.equal(Math.round(box.right - box.left), 90)
    assert.equal(Math.round(box.bottom - box.top), 24)
    assert.ok(box.left >= 0 && box.top >= 0 && box.right <= 400 && box.bottom <= 300, `label ${index} is inside the bounds`)
    for(const target of targets) assert.equal(overlaps(box, target), false, `label ${index} covers an element`)
    for(const other of placed.slice(index + 1)) assert.equal(overlaps(box, other.box), false, `label ${index} covers another label`)
  }
  // No room at all: the caller shows the list instead.
  assert.equal(layoutLabels({left: 0, top: 0, right: 60, bottom: 30}, [{target: {left: 0, top: 0, right: 60, bottom: 30}, width: 90, height: 24, sides: ["bottom"], region: false}]), null)
})

test("a help connector is drawn only between a label and an element that do not touch", () => {
  const target = {left: 100, top: 100, right: 140, bottom: 120}
  assert.equal(connector({left: 100, top: 120, right: 190, bottom: 144}, target), null)
  const line = connector({left: 75, top: 160, right: 165, bottom: 184}, target)
  assert.ok(line.length >= 2)
  // It starts at the element and ends at the label.
  assert.equal(line[0][1], 120)
  assert.equal(line.at(-1)[1], 160)
})
