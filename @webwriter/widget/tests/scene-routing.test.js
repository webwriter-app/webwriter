import {test} from "node:test"
import assert from "node:assert/strict"
import {avoidRoute, orthogonalRoute, route} from "../scene/geometry.js"

const GAP = 12
const EPSILON = 1e-8
const right = {x: 1, y: 0}, left = {x: -1, y: 0}
const down = {x: 0, y: 1}, up = {x: 0, y: -1}
const equal = (a, b) => a.x === b.x && a.y === b.y
const segments = points => points.slice(1).map((point, index) => [points[index], point])

function assertRoute(points, a, da, b, db, boxes) {
  assert.ok(points.length >= 2, "a route exists")
  assert.deepEqual(points[0], a)
  assert.deepEqual(points.at(-1), b)
  for(const [p, q] of segments(points)) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(q.x) && Number.isFinite(q.y))
    assert.ok(p.x === q.x || p.y === q.y, "segments remain orthogonal")
    assert.ok(!equal(p, q), "no zero-length segments")
    for(const box of boxes) {
      const crosses = p.y === q.y
        ? p.y > box.y + EPSILON && p.y < box.y + box.height - EPSILON
          && Math.max(p.x, q.x) > box.x + EPSILON && Math.min(p.x, q.x) < box.x + box.width - EPSILON
        : p.x > box.x + EPSILON && p.x < box.x + box.width - EPSILON
          && Math.max(p.y, q.y) > box.y + EPSILON && Math.min(p.y, q.y) < box.y + box.height - EPSILON
      assert.equal(crosses, false, `segment ${JSON.stringify([p, q])} crosses node ${JSON.stringify(box)}`)
    }
  }
  const first = points[1], last = points.at(-2)
  assert.ok((first.x - a.x) * da.x + (first.y - a.y) * da.y > 0, "leaves source in its port direction")
  assert.ok((last.x - b.x) * db.x + (last.y - b.y) * db.y > 0, "approaches target from its port direction")
}

function assertSeparate(points, previous) {
  for(const earlier of previous) {
    const shared = [points[0], points.at(-1)].filter(point => equal(point, earlier[0]) || equal(point, earlier.at(-1)))
    for(const [p, q] of segments(points)) for(const [r, s] of segments(earlier)) {
      const horizontal = p.y === q.y
      if(horizontal !== (r.y === s.y)) continue
      const along = horizontal ? "x" : "y", across = horizontal ? "y" : "x"
      const lo = Math.max(Math.min(p[along], q[along]), Math.min(r[along], s[along]))
      const hi = Math.min(Math.max(p[along], q[along]), Math.max(r[along], s[along]))
      if(hi - lo <= EPSILON || Math.abs(p[across] - r[across]) >= GAP - EPSILON) continue
      const commonStub = shared.some(port => p[across] === port[across] && r[across] === port[across]
        && Math.abs(lo - port[along]) <= GAP + EPSILON && Math.abs(hi - port[along]) <= GAP + EPSILON)
      assert.ok(commonStub, `connectors share a lane outside a common port stub: ${JSON.stringify([p, q, r, s])}`)
    }
  }
}

// Positions from snippets/branching-scenario.html; Pages nodes are 200×84,
// with input/output port centres 40px below the top (28px inset + 12px radius).
const branchingBoxes = [
  {x: 40, y: 120, width: 200, height: 84},
  {x: 340, y: 40, width: 200, height: 84},
  {x: 340, y: 220, width: 200, height: 84},
]
const branchingLinks = [[0, 1], [0, 2], [1, 0], [2, 0]]
function branchRoutes() {
  const paths = []
  for(const [from, to] of branchingLinks) {
    const source = branchingBoxes[from], target = branchingBoxes[to]
    const a = {x: source.x + source.width, y: source.y + 40}, b = {x: target.x, y: target.y + 40}
    const points = avoidRoute(a, right, b, left, branchingBoxes, GAP, paths)
    assertRoute(points, a, right, b, left, branchingBoxes)
    assertSeparate(points, paths)
    paths.push(points)
  }
  return paths
}

test("three-page fixture routes both choices and both returns without crossing nodes or sharing lanes", () => {
  assert.equal(branchRoutes().length, 4)
})

test("staggered blockers permit a route with independently placed departure and arrival turns", () => {
  const a = {x: 0, y: 0}, b = {x: 300, y: 0}
  const boxes = [
    {x: -40, y: -20, width: 40, height: 40},
    {x: 300, y: -20, width: 40, height: 40},
    {x: 100, y: -30, width: 100, height: 60},
    {x: 0, y: -100, width: 30, height: 80},
    {x: 0, y: 20, width: 30, height: 80},
  ]
  assertRoute(avoidRoute(a, right, b, left, boxes, GAP), a, right, b, left, boxes)
})

for(const fixture of [
  {name: "vertical ports", a: {x: 0, y: 0}, da: down, b: {x: 0, y: 300}, db: up,
    boxes: [{x: -20, y: -40, width: 40, height: 40}, {x: -20, y: 300, width: 40, height: 40}, {x: -30, y: 110, width: 60, height: 70}]},
  {name: "mixed right/top ports", a: {x: 0, y: 0}, da: right, b: {x: 200, y: 200}, db: up,
    boxes: [{x: -40, y: -20, width: 40, height: 40}, {x: 180, y: 200, width: 40, height: 40}, {x: 60, y: -10, width: 40, height: 140}]},
  {name: "right-to-left travel", a: {x: 300, y: 0}, da: left, b: {x: 0, y: 0}, db: right,
    boxes: [{x: 300, y: -20, width: 40, height: 40}, {x: -40, y: -20, width: 40, height: 40}, {x: 120, y: -30, width: 60, height: 60}]},
]) test(`avoidance respects ${fixture.name}`, () => {
  const {a, da, b, db, boxes} = fixture
  assertRoute(avoidRoute(a, da, b, db, boxes, GAP), a, da, b, db, boxes)
})

test("routing is deterministic and does not mutate obstacle boxes or earlier connectors", () => {
  const expected = branchRoutes()
  for(let i = 0; i < 5; i++) assert.deepEqual(branchRoutes(), expected)
  const boxes = structuredClone(branchingBoxes), paths = structuredClone(expected.slice(0, 2))
  const before = structuredClone({boxes, paths})
  avoidRoute({x: 540, y: 80}, right, {x: 40, y: 160}, left, boxes, GAP, paths)
  assert.deepEqual({boxes, paths}, before)
})

test("a port enclosed by a closed obstacle ring has no route instead of a path through a node", () => {
  const boxes = [
    {x: -60, y: -60, width: 120, height: 20},
    {x: -60, y: 40, width: 120, height: 20},
    {x: -60, y: -60, width: 20, height: 120},
    {x: 40, y: -60, width: 20, height: 120},
  ]
  assert.deepEqual(avoidRoute({x: 0, y: 0}, right, {x: 200, y: 0}, left, boxes, GAP), [])
})

test("legacy straight, step, curve, and orthogonal routes retain their established geometry", () => {
  const a = {x: 0, y: 0}, b = {x: 100, y: 40}
  assert.deepEqual(route(a, b, "straight", right, left), {d: "M0 0L100 40", points: [a, b]})
  assert.equal(route(a, b, "step", right, left).d, "M0 0L50 0L50 40L100 40")
  assert.equal(route(a, b, "step", down, up).d, "M0 0L0 20L100 20L100 40")
  const curved = route(a, {x: 100, y: 0}, "curve", right, left)
  assert.equal(curved.d, "M0 0C40 0 60 0 100 0")
  assert.equal(curved.points.length, 17)
  assert.deepEqual(orthogonalRoute(a, right, b, left, [], GAP), [a, {x: 50, y: 0}, {x: 50, y: 40}, b])
})


test("a nearby unrelated node cannot be tunneled through by a port escape stub", () => {
  const boxes = [
    {x: 0, y: 0, width: 100, height: 100},
    {x: 105, y: 40, width: 10, height: 20},
    {x: 300, y: 0, width: 100, height: 100},
  ]
  assert.deepEqual(avoidRoute({x: 100, y: 50}, right, {x: 300, y: 50}, left, boxes, GAP), [])
})
