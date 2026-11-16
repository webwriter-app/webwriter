const SIDES = ["bottom", "top", "right", "left"];
const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };
const GAP = 6;
const RISE = 14;
const HOOK = 10;
const SPREAD = 14;
const LANE = 6;
const STACK = 4;
const SLACK = 0.5;
const BUDGET = 1500;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const overlaps = (a, b) => a.left < b.right - SLACK && a.right > b.left + SLACK && a.top < b.bottom - SLACK && a.bottom > b.top + SLACK;
const inside = (a, b) => a.left >= b.left - SLACK && a.right <= b.right + SLACK && a.top >= b.top - SLACK && a.bottom <= b.bottom + SLACK;
const boxAt = (left, top, item) => ({ left, top, right: left + item.width, bottom: top + item.height });
const centreX = (box) => (box.left + box.right) / 2;
const centreY = (box) => (box.top + box.bottom) / 2;
const upright = (side) => side === "top" || side === "bottom";
function segments(line) {
  if (!line) return [];
  return line.slice(1).map(([x, y], i) => {
    const [px, py] = line[i];
    return { left: Math.min(x, px) - 1, right: Math.max(x, px) + 1, top: Math.min(y, py) - 1, bottom: Math.max(y, py) + 1 };
  });
}
function routes(box, target) {
  const dx = Math.max(target.left - box.right, box.left - target.right, 0);
  const dy = Math.max(target.top - box.bottom, box.top - target.bottom, 0);
  if (dx === 0 && dy === 0) return null;
  if (dx === 0) {
    if (dy <= GAP + 1) return null;
    const x = clamp(clamp(centreX(target), box.left + 3, box.right - 3), target.left, target.right);
    return [
      box.top > target.bottom ? [
        [x, target.bottom],
        [x, box.top]
      ] : [
        [x, target.top],
        [x, box.bottom]
      ]
    ];
  }
  if (dy === 0) {
    if (dx <= GAP + 1) return null;
    const y = clamp(clamp(centreY(target), box.top + 3, box.bottom - 3), target.top, target.bottom);
    return [
      box.left > target.right ? [
        [target.right, y],
        [box.left, y]
      ] : [
        [target.left, y],
        [box.right, y]
      ]
    ];
  }
  const [tx, ty, bx, by] = [centreX(target), centreY(target), centreX(box), centreY(box)];
  return [
    [
      [tx, by < target.top ? target.top : target.bottom],
      [tx, by],
      [box.left > tx ? box.left : box.right, by]
    ],
    [
      [bx < target.left ? target.left : target.right, ty],
      [bx, ty],
      [bx, box.top > ty ? box.top : box.bottom]
    ]
  ];
}
function connector(box, target) {
  return routes(box, target)?.[0] ?? null;
}
function adjacent(item, side, bounds) {
  const t = item.target;
  if (upright(side)) {
    const left = clamp(centreX(t) - item.width / 2, bounds.left, bounds.right - item.width);
    return boxAt(left, side === "top" ? t.top - GAP - item.height : t.bottom + GAP, item);
  }
  const top = clamp(centreY(t) - item.height / 2, bounds.top, bounds.bottom - item.height);
  return boxAt(side === "left" ? t.left - GAP - item.width : t.right + GAP, top, item);
}
function distant(item, side, step, bounds) {
  const t = item.target;
  if (upright(side)) {
    const far2 = RISE + (step - 1) * (item.height + GAP);
    const top = side === "top" ? t.top - far2 - item.height : t.bottom + far2;
    return [centreX(t) - item.width / 2, centreX(t) - HOOK, centreX(t) + HOOK - item.width].map((left2) => boxAt(clamp(left2, bounds.left, bounds.right - item.width), top, item));
  }
  const far = RISE + (step - 1) * 24;
  const left = side === "left" ? t.left - far - item.width : t.right + far;
  return [centreY(t) - item.height / 2, t.top - GAP - item.height, t.bottom + GAP].map((top) => boxAt(left, clamp(top, bounds.top, bounds.bottom - item.height), item));
}
function interior(item, bounds) {
  const t = item.target;
  const [left, right] = [t.left + GAP, t.right - GAP - item.width];
  const [top, bottom] = [t.top + GAP, t.bottom - GAP - item.height];
  const spread = (from, to) => [(from + to) / 2, from, to, from + (to - from) / 4, to - (to - from) / 4];
  return spread(top, bottom).flatMap(
    (y) => spread(left, right).map((x) => boxAt(clamp(x, bounds.left, bounds.right - item.width), clamp(y, bounds.top, bounds.bottom - item.height), item))
  );
}
function layoutLabels(bounds, items, avoid = []) {
  const done = items.map(() => void 0);
  const drawn = items.map(() => []);
  const blockers = items.map((item, i) => [
    ...items.filter((other, j) => j !== i && !other.region && !inside(item.target, other.target) && !inside(other.target, item.target)).map((other) => other.target),
    ...avoid
  ]);
  const allowed = (i, box) => inside(box, bounds) && !blockers[i].some((other) => overlaps(box, other));
  const vacant = (i, box) => done.every((other, j) => !other || j === i || !overlaps(box, other.box) && !drawn[j].some((part) => overlaps(box, part)));
  const free = (i, box) => allowed(i, box) && vacant(i, box);
  const unblocked = (i, parts) => parts.every((part) => !blockers[i].some((other) => overlaps(part, other)));
  const put = (i, box, lines, css = false) => {
    if (!free(i, box)) return false;
    let line = null;
    let parts = [];
    if (lines) {
      const found = lines.find((each) => {
        parts = segments(each);
        return unblocked(i, parts) && parts.every((part) => vacant(i, part));
      });
      if (!found) return false;
      line = found;
    }
    done[i] = { box, line, css };
    drawn[i] = line ? parts : [];
    return true;
  };
  const ideal = items.map((item, i) => {
    if (item.region) return null;
    const sideOf = (box) => box.top >= item.target.bottom ? "bottom" : box.bottom <= item.target.top ? "top" : box.left >= item.target.right ? "right" : "left";
    if (item.css && allowed(i, item.css) && !routes(item.css, item.target)) return { box: item.css, css: true, side: sideOf(item.css) };
    for (const side of item.sides) {
      const box = adjacent(item, side, bounds);
      if (allowed(i, box) && !routes(box, item.target)) return { box, css: false, side };
    }
    return null;
  });
  const group = items.map((_, i) => i);
  const join = (i, j) => {
    const [from, to] = [group[Math.max(i, j)], group[Math.min(i, j)]];
    for (let k = 0; k < group.length; k++) if (group[k] === from) group[k] = to;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const [a, b] = [ideal[i], ideal[j]];
      if (a && b && a.side === b.side && overlaps(a.box, b.box)) join(i, j);
    }
  }
  const aligned = (a, b, side) => {
    const [from, to, size] = upright(side) ? [Math.max(a.top, b.top), Math.min(a.bottom, b.bottom), Math.min(a.bottom - a.top, b.bottom - b.top)] : [Math.max(a.left, b.left), Math.min(a.right, b.right), Math.min(a.right - a.left, b.right - b.left)];
    return to - from >= size / 2;
  };
  for (let i = 0; i < items.length; i++) {
    if (items[i].region || group.filter((g) => g === group[i]).length > 1) continue;
    for (let j = 0; j < items.length; j++) {
      const other = ideal[j];
      if (j === i || !other || other.side === ideal[i]?.side || !aligned(items[i].target, items[j].target, other.side)) continue;
      if (!overlaps(adjacent(items[i], other.side, bounds), other.box)) continue;
      join(i, j);
      break;
    }
  }
  const units = [];
  for (let i = 0; i < items.length; i++) {
    if (group[i] !== i) continue;
    const members = group.flatMap((g, j) => g === i ? [j] : []);
    const sides = members.flatMap((member) => ideal[member]?.side ?? []);
    const side = SIDES.reduce((best, each) => sides.filter((s) => s === each).length > sides.filter((s) => s === best).length ? each : best, sides[0]);
    units.push({ members, side: members.length > 1 ? side : null });
  }
  const claims = items.map((item, i) => {
    const unit = units.find((each) => each.members.includes(i));
    const wish = ideal[i]?.box ?? item.target;
    const claim = {
      left: Math.min(item.target.left, wish.left),
      top: Math.min(item.target.top, wish.top),
      right: Math.max(item.target.right, wish.right),
      bottom: Math.max(item.target.bottom, wish.bottom)
    };
    if (!unit.side || upright(unit.side)) return claim;
    const reach = GAP + (unit.members.length - 1) * LANE + GAP + Math.max(...unit.members.map((member) => items[member].width));
    if (unit.side === "right") claim.right = Math.max(claim.right, Math.max(...unit.members.map((member) => items[member].target.right)) + reach);
    else claim.left = Math.min(claim.left, Math.min(...unit.members.map((member) => items[member].target.left)) - reach);
    return claim;
  });
  const spots = /* @__PURE__ */ new Map();
  const near = (i) => {
    const item = items[i];
    const all = [];
    if (item.region) {
      if (item.css && inside(item.css, item.target)) all.push({ box: item.css, lines: null, css: true });
      for (const box of interior(item, bounds)) all.push({ box, lines: null, css: false });
    } else {
      const first = ideal[i];
      if (first) all.push({ box: first.box, lines: null, css: first.css });
      for (const side of item.sides) {
        const box = adjacent(item, side, bounds);
        if (!routes(box, item.target)) all.push({ box, lines: null, css: false });
      }
    }
    return all.filter(({ box }) => allowed(i, box));
  };
  const far = (i) => {
    const item = items[i];
    const all = [];
    for (let step = 1; step <= 8 && !item.region; step++) {
      for (const side of item.sides) {
        for (const box of distant(item, side, step, bounds)) {
          if (!allowed(i, box)) continue;
          const lines = routes(box, item.target)?.filter((line) => unblocked(i, segments(line)));
          if (lines?.length) all.push({ box, lines, css: false });
        }
      }
    }
    return all;
  };
  function* single(i) {
    const known = spots.get(i) ?? spots.set(i, {}).get(i);
    for (const { box, lines, css } of known.near ??= near(i)) yield () => put(i, box, lines, css);
    for (const { box, lines, css } of known.far ??= far(i)) yield () => put(i, box, lines, css);
  }
  function* staircase(members, side) {
    const sorted = [...members].sort((a, b) => centreX(items[a].target) - centreX(items[b].target));
    const count = sorted.length;
    const down = side === "bottom";
    const sign = down ? 1 : -1;
    const edge = down ? Math.max(...sorted.map((j) => items[j].target.bottom)) : Math.min(...sorted.map((j) => items[j].target.top));
    const row = Math.max(...sorted.map((j) => items[j].height)) + GAP;
    const centres = sorted.map((j) => centreX(items[j].target));
    const widths = sorted.map((j) => items[j].width);
    const leftish = centres.reduce((sum, x) => sum + x, 0) / count < centreX(bounds);
    const zones = items.flatMap(
      (other, j) => members.includes(j) || other.region || !(down ? other.target.top >= edge - SLACK : other.target.bottom <= edge + SLACK) ? [] : [claims[j]]
    );
    const margin = 4 * GAP;
    const cutLeft = Math.max(bounds.left, ...zones.filter((zone) => zone.left <= bounds.left + margin).map((zone) => zone.right + GAP));
    const cutRight = Math.min(bounds.right, ...zones.filter((zone) => zone.right >= bounds.right - margin).map((zone) => zone.left - GAP));
    const bands = [
      [cutLeft, bounds.right],
      [bounds.left, cutRight],
      [cutLeft, cutRight],
      [bounds.left, bounds.right]
    ].filter(([left, right], i, all) => right - left > 0 && all.findIndex((other) => other[0] === left && other[1] === right) === i);
    const plans = [];
    bands.forEach(([left, right], band) => {
      for (let split = 0; split <= count; split++) {
        const apart = (i) => i === split ? 2 * HOOK + GAP : SPREAD;
        const low = centres.map((_, i) => i < split ? left + widths[i] - HOOK : left + HOOK);
        const high = centres.map((_, i) => i < split ? right - HOOK : right - widths[i] + HOOK);
        for (let i = 1; i < count; i++) low[i] = Math.max(low[i], low[i - 1] + apart(i));
        for (let i = count - 2; i >= 0; i--) high[i] = Math.min(high[i], high[i + 1] - apart(i + 1));
        if (low.some((x, i) => x > high[i] + SLACK)) continue;
        const drops = [];
        for (let i = 0; i < count; i++) drops[i] = clamp(Math.max(centres[i], i > 0 ? drops[i - 1] + apart(i) : -Infinity), low[i], high[i]);
        if (plans.some((plan) => plan.split === split && plan.drops.every((x, i) => Math.abs(x - drops[i]) <= SLACK))) continue;
        const detours = drops.map((x, i) => Math.abs(x - centres[i]));
        plans.push({ split, drops, jogs: detours.filter((detour) => detour > SLACK).length, detour: detours.reduce((sum, detour) => sum + detour, 0), band });
      }
    });
    const lines = (plan) => Math.max(plan.split, count - plan.split);
    const bent = (plan) => Number(plan.jogs > 0);
    plans.sort(
      (a, b) => bent(a) - bent(b) || bent(a) * (a.band - b.band) || lines(a) - lines(b) || a.jogs - b.jogs || (leftish ? a.split - b.split : b.split - a.split) || a.detour - b.detour
    );
    for (const { split, drops } of plans) {
      yield () => {
        const rightward = drops.map((x, i) => x - centres[i] > SLACK);
        const leftward = drops.map((x, i) => centres[i] - x > SLACK);
        const lanes = Math.max(rightward.filter(Boolean).length, leftward.filter(Boolean).length);
        const depth = drops.map((_, i) => rightward[i] ? rightward.slice(i + 1).filter(Boolean).length : leftward.slice(0, i).filter(Boolean).length);
        const first = edge + sign * Math.max(RISE, lanes > 0 ? GAP + lanes * LANE + GAP : 0);
        const steps = [0, 0];
        const order = [...sorted.keys()].sort((a, b) => (a < split ? a : count - 1 - a) - (b < split ? b : count - 1 - b));
        for (const i of order) {
          const item = items[sorted[i]];
          const part = i < split ? 0 : 1;
          const left = part === 0 ? drops[i] + HOOK - item.width : drops[i] - HOOK;
          const bend = edge + sign * (GAP + depth[i] * LANE);
          for (; ; ) {
            const near2 = first + sign * steps[part]++ * row;
            const box = boxAt(left, down ? near2 : near2 - item.height, item);
            if (box.top < bounds.top - SLACK || box.bottom > bounds.bottom + SLACK) return false;
            const from = [centres[i], down ? item.target.bottom : item.target.top];
            const line = rightward[i] || leftward[i] ? [from, [centres[i], bend], [drops[i], bend], [drops[i], near2]] : [from, [centres[i], near2]];
            if (put(sorted[i], box, [line])) break;
          }
        }
        return true;
      };
    }
  }
  function* stack(members, side) {
    const sorted = [...members].sort((a, b) => centreY(items[a].target) - centreY(items[b].target));
    const [head, tail] = [items[sorted[0]], items[sorted[sorted.length - 1]]];
    const total = sorted.reduce((sum, j) => sum + items[j].height, 0) + STACK * (sorted.length - 1);
    if (total > bounds.bottom - bounds.top) return;
    const wanted = (centreY(head.target) - head.height / 2 + centreY(tail.target) + tail.height / 2) / 2 - total / 2;
    const pitch = total / sorted.length;
    const starts = new Set([0, 0.5, -0.5, 1, -1, 2, -2].map((shift) => clamp(wanted + shift * pitch, bounds.top, bounds.bottom - total)));
    for (const start of starts) yield* stackAt(sorted, side, start);
  }
  function* stackAt(sorted, side, start) {
    const tops = [];
    let top = start;
    for (const j of sorted) {
      tops.push(top);
      top += items[j].height + STACK;
    }
    const right = side === "right";
    const sign = right ? 1 : -1;
    const edge = right ? Math.max(...sorted.map((j) => items[j].target.right)) : Math.min(...sorted.map((j) => items[j].target.left));
    const reach = sorted.map((j, i) => Math.min(items[j].target.bottom, tops[i] + items[j].height - 3) - Math.max(items[j].target.top, tops[i] + 3));
    const jogged = reach.map((overlap) => overlap < 0);
    const above = sorted.map((j, i) => tops[i] + items[j].height / 2 < centreY(items[j].target));
    const lane = sorted.map(() => -1);
    const lanes = [0, 0];
    for (let i = 0; i < sorted.length; i++) if (jogged[i] && above[i]) lane[i] = lanes[0]++;
    for (let i = sorted.length - 1; i >= 0; i--) if (jogged[i] && !above[i]) lane[i] = lanes[1]++;
    const offset = Math.max(...lanes) > 0 ? GAP + Math.max(...lanes) * LANE + GAP : GAP;
    yield () => {
      for (const [i, j] of sorted.entries()) {
        const item = items[j];
        const box = boxAt(right ? edge + offset : edge - offset - item.width, tops[i], item);
        const [from, to] = right ? [item.target.right, box.left] : [item.target.left, box.right];
        let lines = null;
        if (jogged[i]) {
          const bend = edge + sign * (GAP + lane[i] * LANE);
          lines = [
            [
              [from, centreY(item.target)],
              [bend, centreY(item.target)],
              [bend, centreY(box)],
              [to, centreY(box)]
            ]
          ];
        } else if (Math.abs(to - from) > GAP + 1) {
          const y = clamp(clamp(centreY(item.target), box.top + 3, box.bottom - 3), item.target.top, item.target.bottom);
          lines = [
            [
              [from, y],
              [to, y]
            ]
          ];
        }
        if (!put(j, box, lines)) return false;
      }
      return true;
    };
  }
  function* candidates(unit) {
    if (!unit.side) yield* single(unit.members[0]);
    else if (upright(unit.side)) {
      yield* staircase(unit.members, unit.side);
      yield* staircase(unit.members, OPPOSITE[unit.side]);
    } else {
      yield* stack(unit.members, unit.side);
      yield* stack(unit.members, OPPOSITE[unit.side]);
    }
  }
  let budget = BUDGET;
  const solve = (queue, index) => {
    if (index === queue.length) return true;
    const unit = queue[index];
    const reset = () => unit.members.forEach((member) => done[member] = void 0);
    for (const place of candidates(unit)) {
      if (budget-- <= 0) return false;
      if (place() && solve(queue, index + 1)) return true;
      reset();
    }
    if (unit.members.length === 1 || budget <= 0) return false;
    return solve([...queue.slice(0, index), ...unit.members.map((member) => ({ members: [member], side: null })), ...queue.slice(index + 1)], index);
  };
  return solve(units, 0) ? done : null;
}
export {
  connector,
  layoutLabels
};
