import { graphicShapePresets, legacyArrowPresets, legacyBannerPaths, legacyCalloutPresets, legacyChordPreset, legacyCloudPreset, legacyRoundFlowPresets, legacySequentialStoragePreset, legacySpeechBubblePresets, isConnectedCalloutType, connectedCalloutTypes, constrainCalloutTip, speechBubblePrefix } from "./presets";
const graphicConnectorRole = "connector";
const numberPattern = /[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g;
const reversedDetailPresets = /* @__PURE__ */ new Set([
  "cylinder",
  "cube",
  "folded-corner",
  "magnetic-disk",
  "direct-access-storage"
]);
function presetDrawing(type, values) {
  const path = graphicShapePresets[type].draw(values);
  if (!reversedDetailPresets.has(type)) return path;
  return orientDetailContours(path);
}
function orientDetailContours(path) {
  return path.split(/(?=M)/).map((subpath) => {
    if (subpath.includes("Z")) return subpath.trim();
    const commands = Array.from(subpath.matchAll(/([MLQC])([^MLQCZ]+)/g), (match) => ({
      command: match[1],
      values: coordinates(match[2])
    }));
    const end = commands.at(-1).values.slice(-2);
    const reversed = commands.slice(1).map((command, i) => {
      const start = commands[i].values.slice(-2);
      const controls = command.values.slice(0, -2);
      if (command.command === "C") controls.push(...controls.splice(0, 2));
      return `${command.command} ${[...controls, ...start].join(" ")}`;
    }).reverse();
    return `M ${end.join(" ")} ${reversed.join(" ")}`;
  }).join(" ");
}
function graphicPresetFillRule(type) {
  return ["frame", "donut", "prohibited"].includes(type) ? "evenodd" : "nonzero";
}
const graphicPresetOptions = Object.keys(graphicShapePresets).map((type) => {
  const definition = graphicShapePresets[type];
  return {
    type,
    label: definition.label,
    category: definition.category,
    icon: "Shape",
    path: type === "text-box" ? "M 0 0 L 100 0 L 100 100 L 0 100 Z M 12 50 L 25 15 L 38 50 M 17 38 L 33 38 M 48 20 L 88 20 M 48 40 L 88 40 M 12 65 L 88 65 M 12 82 L 88 82" : presetDrawing(type, definition.adjustments.map((adjustment) => adjustment.default))
  };
});
function isGraphicPresetType(type) {
  return Object.hasOwn(graphicShapePresets, type);
}
const defaults = (definition) => definition.adjustments.map((adjustment) => adjustment.default);
function coordinates(path) {
  return Array.from(path.matchAll(numberPattern), (match) => Number(match[0]));
}
const signature = (path) => path.replace(numberPattern, "#").replace(/[\s,]+/g, "");
const coordinateOrArcPattern = new RegExp(`A([^MLQCAZ]+)|${numberPattern.source}`, "g");
function scalePath(path, bounds, precision = 1e6) {
  const clean = (value) => String(Math.round(value * precision) / precision);
  let index = 0;
  return path.replace(coordinateOrArcPattern, (value, arc) => {
    if (arc) {
      const [rx, ry, rotation, large, sweep, x, y] = coordinates(arc);
      return `A ${clean(rx / 100 * bounds.width)} ${clean(ry / 100 * bounds.height)} ${rotation} ${large} ${sweep} ${clean(bounds.x + x / 100 * bounds.width)} ${clean(bounds.y + y / 100 * bounds.height)} `;
    }
    const horizontal = index++ % 2 === 0;
    return clean((horizontal ? bounds.x : bounds.y) + Number(value) / 100 * (horizontal ? bounds.width : bounds.height));
  });
}
function reflectPoint(point, bounds, reflection) {
  return {
    x: reflection?.horizontal ? 2 * bounds.x + bounds.width - point.x : point.x,
    y: reflection?.vertical ? 2 * bounds.y + bounds.height - point.y : point.y
  };
}
function reflectPath(path, bounds, reflection) {
  let index = 0;
  const clean = (value) => String(Math.round(value * 1e10) / 1e10);
  return path.replace(coordinateOrArcPattern, (value, arc) => {
    if (arc) {
      const [rx, ry, rotation, large, sweep, x, y] = coordinates(arc);
      const point2 = reflectPoint({ x, y }, bounds, reflection), reverse = reflection.horizontal !== reflection.vertical;
      return `A ${rx} ${ry} ${reverse ? -rotation : rotation} ${large} ${reverse ? 1 - sweep : sweep} ${clean(point2.x)} ${clean(point2.y)} `;
    }
    const horizontal = index++ % 2 === 0, axis = horizontal ? "x" : "y";
    const point = reflectPoint({ x: Number(value), y: Number(value) }, bounds, reflection);
    return clean(point[axis]);
  });
}
function graphicPresetPath(type, bounds, values = defaults(graphicShapePresets[type]), reflection) {
  const path = scalePath(presetDrawing(type, values), bounds, type === "chord" || type === "sequential-access-storage" ? 1e10 : 1e6);
  return reflection?.horizontal || reflection?.vertical ? reflectPath(path, bounds, reflection) : path;
}
function writeGraphicPreset(element, state, bounds = state.bounds, values = state.values) {
  element.setAttribute("d", graphicPresetPath(state.type, bounds, values, state.reflection));
  element.setAttribute("fill-rule", graphicPresetFillRule(state.type));
}
let templates;
const legacyDelayPath = ([r]) => `M 0 0 L ${100 - r} 0 C 100 0 100 100 ${100 - r} 100 L 0 100 Z`;
function getTemplates() {
  if (templates) return templates;
  templates = /* @__PURE__ */ new Map();
  for (const option of graphicPresetOptions) {
    const definition = graphicShapePresets[option.type];
    const drawings = option.type === "pie" ? [([p]) => `M 50 50 L 100 ${p} C 100 78 78 100 50 100 C 22 100 0 78 0 50 C 0 22 22 0 50 0 L 50 50 Z`] : option.type === "chord" || option.type === "sequential-access-storage" || isConnectedCalloutType(option.type) ? [] : [(values) => presetDrawing(option.type, values)];
    if (reversedDetailPresets.has(option.type)) drawings.push(definition.draw);
    for (const legacyBanner of legacyBannerPaths[option.type] ?? []) {
      drawings.push(legacyBanner);
      if (option.type === "ribbon-up" || option.type === "ribbon-down") {
        drawings.push((values) => orientDetailContours(legacyBanner(values)));
      }
    }
    if (option.type === "delay") drawings.push(legacyDelayPath);
    if (option.type === "left-brace") {
      drawings.push(([p]) => `M 70 5 Q 48 5 52 25 L 52 40 Q 52 50 ${p} 50 Q 52 50 52 60 L 52 75 Q 48 95 70 95`);
    }
    if (option.type === "right-brace") {
      drawings.push(([p]) => `M 30 5 Q 52 5 48 25 L 48 40 Q 48 50 ${100 - p} 50 Q 48 50 48 60 L 48 75 Q 52 95 30 95`);
    }
    if (option.type === "double-wave") {
      drawings.push(([d]) => `M 0 20 Q 25 ${20 - d} 50 20 Q 75 ${20 + d} 100 20 L 100 80 Q 75 ${80 + d} 50 80 Q 25 ${80 - d} 0 80 Z`);
    }
    if (option.type === "collate") {
      drawings.push(([p]) => `M 0 0 L 100 0 L 0 100 L 100 100 L ${p} 50 Z`);
    }
    if (option.type === "moon") {
      drawings.push(([d]) => `M ${75 - d / 2} 8 C 40 18 30 65 65 92 C 45 92 15 78 10 52 C 5 25 35 3 ${75 - d / 2} 8 Z`);
    }
    if (option.type === "prohibited") {
      const outer = definition.draw([0]).split(/(?=M)/)[0];
      drawings.push(([r]) => `${outer} M ${50 - r * 0.7} ${50 - r * 0.7} C ${50 - r * 1.5} ${50 + r * 0.2} ${50 - r * 0.2} ${50 + r * 1.5} ${50 + r * 0.7} ${50 + r * 0.7} Z M ${50 + r * 0.7} ${50 + r * 0.7 - 12} C ${50 + r * 1.5} ${50 - r * 0.2} ${50 + r * 0.2} ${50 - r * 1.5} ${50 - r * 0.7 + 12} ${50 - r * 0.7} Z`);
    }
    const legacy = option.type === "cloud" ? legacyCloudPreset : option.type === "chord" ? legacyChordPreset : legacyRoundFlowPresets[option.type] ?? legacyCalloutPresets[option.type] ?? legacyArrowPresets[option.type];
    const variants = [
      ...drawings.map((draw) => ({ draw, definition, upgrade: void 0 })),
      ...legacy ? [{ draw: legacy.definition.draw, definition: legacy.definition, upgrade: legacy.upgrade }] : [],
      ...legacySpeechBubblePresets[option.type] ? [{ draw: legacySpeechBubblePresets[option.type].definition.draw, definition: legacySpeechBubblePresets[option.type].definition, upgrade: legacySpeechBubblePresets[option.type].upgrade }] : []
    ];
    if (option.type === "sequential-access-storage") {
      const { definition: definition2, upgrade } = legacySequentialStoragePreset;
      variants.push(
        { draw: definition2.draw, definition: definition2, upgrade },
        { draw: (values) => orientDetailContours(definition2.draw(values)), definition: definition2, upgrade }
      );
    }
    for (const { draw: originalDraw, definition: definition2, upgrade } of variants) {
      const normalizedIndex = definition2.adjustments.findIndex((adjustment) => adjustment.name === definition2.normalizedAdjustment);
      const draw = normalizedIndex < 0 ? originalDraw : (values) => originalDraw(values.map((value, i) => i === normalizedIndex ? definition2.adjustments[i].default : value));
      const zero = definition2.adjustments.map(() => 0);
      const path = draw(zero);
      const base = coordinates(path);
      const deltas = zero.map((_, index) => coordinates(draw(zero.map((_2, i) => i === index ? 1 : 0))).map((value, i) => value - base[i]));
      const key = signature(path);
      const candidates = templates.get(key) ?? [];
      candidates.push({ type: option.type, definition: definition2, base, deltas, draw, upgrade });
      templates.set(key, candidates);
    }
  }
  return templates;
}
function fitAxis(template, actual, axis) {
  const columns = [
    actual.filter((_, i) => i % 2 === axis).map(() => 1),
    template.base.filter((_, i) => i % 2 === axis),
    ...template.deltas.map((delta) => delta.filter((_, i) => i % 2 === axis))
  ];
  const target = actual.filter((_, i) => i % 2 === axis);
  const orthogonal = [];
  const indices = [];
  const triangular = [];
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  columns.forEach((column, index) => {
    const residual = [...column];
    const coefficients = orthogonal.map((vector) => {
      const coefficient = dot(vector, residual);
      vector.forEach((value, i) => residual[i] -= coefficient * value);
      return coefficient;
    });
    const length = Math.hypot(...residual);
    if (length < 1e-8) return;
    coefficients.push(length);
    triangular.push(coefficients);
    orthogonal.push(residual.map((value) => value / length));
    indices.push(index);
  });
  if (!indices.includes(1)) return null;
  const projected = orthogonal.map((vector) => dot(vector, target));
  const result = columns.map(() => void 0);
  for (let i = indices.length - 1; i >= 0; i--) {
    let value = projected[i];
    for (let j = i + 1; j < indices.length; j++) value -= triangular[j][i] * result[indices[j]];
    result[indices[i]] = value / triangular[i][i];
  }
  return result;
}
const cache = /* @__PURE__ */ new WeakMap();
function readPiePreset(path, actual) {
  if (signature(path) !== "M##L##A#######A#######Z" || !actual.every(Number.isFinite)) return null;
  const [cx, cy, , , rx, ry, , , , middleX, middleY] = actual;
  if (!(rx > 0 && ry > 0)) return null;
  const bounds = { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  const sweep = 2 * Math.atan2(Math.max(0, -(middleX - cx) / rx), -(middleY - cy) / ry) * 180 / Math.PI;
  const expected = coordinates(graphicPresetPath("pie", bounds, [sweep]));
  if (expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > 1e-4)) return null;
  return { type: "pie", definition: graphicShapePresets.pie, bounds, values: [sweep] };
}
function readChordPreset(path, actual) {
  if (signature(path) !== "M##A#######A#######Z" || !actual.every(Number.isFinite)) return null;
  const [sx, sy, rx, ry, , , , mx, my] = actual;
  if (!(rx > 0 && ry > 0)) return null;
  const dx = (sx - mx) / (2 * rx), dy = (sy - my) / (2 * ry);
  const distance = dx * dx + dy * dy;
  if (distance <= 0 || distance > 0.750001) return null;
  const factor = -Math.sqrt((1 - distance) / distance);
  const cx = (sx + mx) / 2 + factor * rx * dy;
  const cy = (sy + my) / 2 - factor * ry * dx;
  const bounds = { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  let start = (Math.atan2(-(sx - cx) / rx, -(sy - cy) / ry) * 180 / Math.PI + 360) % 360;
  if (Math.min(start, 360 - start) < 1e-7) start = 0;
  let sweep = 6 * Math.asin(Math.min(1, Math.sqrt(distance))) * 180 / Math.PI;
  if (sweep > 360 - 1e-7) sweep = 360;
  if (sweep < 0.5 - 1e-7 || sweep > 360) return null;
  const expected = coordinates(graphicPresetPath("chord", bounds, [start, sweep]));
  if (expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > 1e-4)) return null;
  return { type: "chord", definition: graphicShapePresets.chord, bounds, values: [start, Math.max(0.5, sweep)] };
}
function readSequentialStoragePreset(path, actual) {
  if (signature(path) !== "M##A#######A#######A#######L##L##Z" || !actual.every(Number.isFinite)) return null;
  const [, bottom, rx, ry, , , , left, centerY] = actual;
  if (!(rx > 0 && ry > 0)) return null;
  const bounds = { x: left, y: centerY - ry, width: rx * 2, height: ry / 0.45 };
  const type = "sequential-access-storage", definition = graphicShapePresets[type];
  const { min, max } = definition.adjustments[0];
  const height = (bottom - actual.at(-3)) / bounds.height * 100;
  if (height < min - 1e-4 || height > max + 1e-4) return null;
  const values = [Math.max(min, Math.min(max, height))];
  const expected = coordinates(graphicPresetPath(type, bounds, values));
  if (expected.some((value, i) => Math.abs(value - actual[i]) > 1e-4)) return null;
  return { type, definition, bounds, values };
}
function readSpeechBubblePreset(path, label) {
  const commands = [...path.matchAll(/([MLQCZ])([^MLQCZ]*)/g)];
  const types = [...connectedCalloutTypes].sort((a, b) => Number(graphicShapePresets[b].label === label) - Number(graphicShapePresets[a].label === label));
  for (const type of types) for (let direction = 0; direction < (type.startsWith("line-callout-") || type === "cloud-callout" ? 1 : 4); direction++) {
    const prefix = speechBubblePrefix(type, 0, direction), count = [...prefix.matchAll(/[MLQCZ]/g)].length;
    const source = commands.slice(0, count).map((command) => command[0]).join(" ");
    if (signature(source) !== signature(prefix)) continue;
    const base = coordinates(prefix), changed = coordinates(speechBubblePrefix(type, 1, direction));
    const template = { base, deltas: [changed.map((value, i) => value - base[i])] };
    const actual = coordinates(source), horizontal = fitAxis(template, actual, 0), vertical = fitAxis(template, actual, 1);
    if (!horizontal || !vertical || horizontal[1] <= 0 || vertical[1] <= 0) continue;
    const axis = horizontal[2] === void 0 ? vertical : horizontal;
    const r = axis[2] === void 0 ? 0 : axis[2] / axis[1];
    const definition = graphicShapePresets[type], adjustment = definition.adjustments[2];
    if (r < adjustment.min - 1e-4 || r > adjustment.max + 1e-4) continue;
    const bounds = { x: horizontal[0], y: vertical[0], width: horizontal[1] * 100, height: vertical[1] * 100 };
    const numbers = coordinates(path);
    for (const command of commands.slice(count)) {
      if (command[1] !== (type === "cloud-callout" ? "M" : "L")) continue;
      const [x, y] = coordinates(command[2]), ex = (x - bounds.x) / bounds.width * 100 + (type === "cloud-callout" ? 3 : 0), ey = (y - bounds.y) / bounds.height * 100;
      if (!Number.isFinite(ex) || !Number.isFinite(ey) || ex < -150 - 1e-4 || ex > 250 + 1e-4 || ey < -150 - 1e-4 || ey > 250 + 1e-4) continue;
      const values = [ex, ey, Math.max(adjustment.min, Math.min(adjustment.max, r))];
      const expected = graphicPresetPath(type, bounds, values);
      if (signature(expected) !== signature(path)) continue;
      const points = coordinates(expected);
      if (points.length === numbers.length && points.every((value, i) => Math.abs(value - numbers[i]) < 1e-4)) return { type, definition, bounds, values };
    }
  }
  return null;
}
function readGraphicPreset(element) {
  if (element?.namespaceURI !== "http://www.w3.org/2000/svg" || element.localName !== "path" || element.getAttribute("aria-roledescription") === graphicConnectorRole) return null;
  const path = element.getAttribute("d") ?? "";
  const label = element.getAttribute("aria-label");
  const previous = cache.get(element);
  if (previous?.path === path && previous.label === label) return previous.state;
  const preferred = graphicPresetOptions.find((option) => option.label === label)?.type;
  let state = null;
  const reflections = [
    { horizontal: false, vertical: false },
    { horizontal: true, vertical: false },
    { horizontal: false, vertical: true },
    { horizontal: true, vertical: true }
  ];
  for (const type of preferred ? [preferred, void 0] : [void 0]) {
    for (const reflection of reflections) {
      const mirrored = reflection.horizontal || reflection.vertical;
      const candidate = readPreset(mirrored ? reflectPath(path, { x: 0, y: 0, width: 0, height: 0 }, reflection) : path, label, type);
      if (!candidate) continue;
      state = mirrored ? { ...candidate, bounds: {
        ...candidate.bounds,
        x: reflection.horizontal ? -candidate.bounds.x - candidate.bounds.width : candidate.bounds.x,
        y: reflection.vertical ? -candidate.bounds.y - candidate.bounds.height : candidate.bounds.y
      }, reflection } : candidate;
      break;
    }
    if (state) break;
  }
  cache.set(element, { path, label, state });
  return state;
}
function readPreset(path, label, preferred) {
  const actual = coordinates(path);
  let state = readPiePreset(path, actual) ?? readChordPreset(path, actual) ?? readSequentialStoragePreset(path, actual) ?? readSpeechBubblePreset(path, label);
  if (state && preferred && state.type !== preferred) state = null;
  const candidates = state ? [] : [...getTemplates().get(signature(path)) ?? []];
  candidates.sort((a, b) => Number(b.definition.label === label) - Number(a.definition.label === label));
  for (const template of candidates) {
    if (preferred && template.type !== preferred) continue;
    const horizontal = fitAxis(template, actual, 0);
    const vertical = fitAxis(template, actual, 1);
    if (!horizontal || !vertical || horizontal[1] <= 0 || vertical[1] <= 0) continue;
    const values = template.definition.adjustments.map((adjustment, i) => {
      const axis = horizontal[i + 2] !== void 0 ? horizontal : vertical;
      return axis[i + 2] === void 0 ? adjustment.default : axis[i + 2] / axis[1];
    });
    if (values.some((value, i) => !Number.isFinite(value) || value < template.definition.adjustments[i].min - 1e-4 || value > template.definition.adjustments[i].max + 1e-4)) continue;
    if (template.type === "pie" && (values[0] < 5 - 1e-4 || values[0] > 75 + 1e-4)) continue;
    const bounds = { x: horizontal[0], y: vertical[0], width: horizontal[1] * 100, height: vertical[1] * 100 };
    const expected = coordinates(scalePath(template.draw(values), bounds));
    if (expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > 1e-4)) continue;
    if (template.draw === legacyDelayPath) {
      const inset = bounds.width * values[0] / 100;
      bounds.width -= inset / 4;
      values[0] = inset * 0.75 / bounds.width * 100;
    }
    state = {
      type: template.type,
      definition: graphicShapePresets[template.type],
      bounds,
      values: template.upgrade ? template.upgrade(values) : template.type === "pie" ? [270 - Math.atan2(values[0] - 50, 50) * 180 / Math.PI] : values
    };
    break;
  }
  return state;
}
function graphicPresetHandles(state) {
  return state.definition.adjustments.flatMap((adjustment, index) => {
    if (adjustment.hidden) return [];
    if (state.definition.adjustments.some((other) => other.pairedWith === adjustment.name)) return [];
    const point = reflectPoint(adjustment.point(state.values), { x: 0, y: 0, width: 100, height: 100 }, state.reflection);
    return {
      name: `adjust-${adjustment.name}`,
      label: adjustment.pairedWith ? adjustment.label.replace(/ X$/, "") : adjustment.label,
      index,
      point: { x: state.bounds.x + point.x / 100 * state.bounds.width, y: state.bounds.y + point.y / 100 * state.bounds.height }
    };
  });
}
function graphicPresetAngle(bounds, input, previous, reflection) {
  input = reflectPoint(input, bounds, reflection);
  const x = (input.x - bounds.x - bounds.width / 2) / (bounds.width / 2);
  const y = (input.y - bounds.y - bounds.height / 2) / (bounds.height / 2);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 1e-4) return void 0;
  let value = (Math.atan2(-x, -y) * 180 / Math.PI + 360) % 360;
  value += Math.trunc((previous - value) / 360) * 360;
  if (value - previous > 180) value -= 360;
  else if (value - previous < -180) value += 360;
  return value;
}
function adjustGraphicPreset(element, state, name, input, mirror = {}) {
  if (typeof input !== "number") input = reflectPoint(input, state.bounds, state.reflection);
  const index = state.definition.adjustments.findIndex((adjustment2) => `adjust-${adjustment2.name}` === name);
  if (index < 0) return false;
  const adjustment = state.definition.adjustments[index];
  if (state.type === "chord") {
    const [start, sweep] = state.values, end = start + sweep;
    let value2 = typeof input === "number" ? input : graphicPresetAngle(state.bounds, input, index === 0 ? start : end);
    if (value2 === void 0 || !Number.isFinite(value2)) return false;
    if (index === 0) {
      const next = Math.max(end - 360, Math.min(end - 0.5, value2));
      writeGraphicPreset(element, state, state.bounds, [(next % 360 + 360) % 360, end - next]);
    } else {
      if (typeof input !== "number") value2 -= start;
      writeGraphicPreset(element, state, state.bounds, [start, Math.max(0.5, Math.min(360, value2))]);
    }
    return true;
  }
  const values = [...state.values];
  let value;
  if (typeof input === "number") value = input;
  else if (adjustment.axis === "angle") {
    const angle = graphicPresetAngle(state.bounds, input, state.values[index]);
    if (angle === void 0) return false;
    value = angle;
  } else {
    const axis = adjustment.axis;
    const origin = adjustment.point(values)[axis];
    values[index] += 1;
    const slope = adjustment.point(values)[axis] - origin;
    if (Math.abs(slope) < 1e-8) return false;
    const size = axis === "x" ? state.bounds.width : state.bounds.height;
    if (size <= 0) return false;
    value = state.values[index] + ((input[axis] - state.bounds[axis]) / size * 100 - origin) / slope;
  }
  if (!Number.isFinite(value)) return false;
  values[index] = Math.max(adjustment.min, Math.min(adjustment.max, value));
  if (typeof input !== "number" && adjustment.pairedWith) {
    const pairedIndex = state.definition.adjustments.findIndex((other) => other.name === adjustment.pairedWith);
    if (pairedIndex >= 0) {
      const paired = state.definition.adjustments[pairedIndex], axis = paired.axis === "y" ? "y" : "x";
      const origin = paired.point(state.values)[axis], sample = [...state.values];
      sample[pairedIndex] += 1;
      const slope = paired.point(sample)[axis] - origin;
      const size = axis === "x" ? state.bounds.width : state.bounds.height;
      if (Math.abs(slope) > 1e-8 && size > 0) {
        const coordinate = state.values[pairedIndex] + ((input[axis] - state.bounds[axis]) / size * 100 - origin) / slope;
        if (!Number.isFinite(coordinate)) return false;
        values[pairedIndex] = Math.max(paired.min, Math.min(paired.max, coordinate));
      }
    }
  }
  if ((adjustment.corner || adjustment.opposite) && (mirror.horizontal || mirror.vertical)) {
    const [vertical, horizontal] = adjustment.corner?.split("-") ?? [];
    const delta = values[index] - state.values[index];
    state.definition.adjustments.forEach((other, i) => {
      if (i === index) return;
      const [otherVertical, otherHorizontal] = other.corner?.split("-") ?? [];
      const reflectedCorner = adjustment.corner && other.corner && (vertical === otherVertical || mirror.vertical) && (horizontal === otherHorizontal || mirror.horizontal);
      if (other.name === adjustment.opposite || reflectedCorner) {
        values[i] = Math.max(other.min, Math.min(other.max, state.values[i] + delta));
      }
    });
  }
  if (state.definition.adjustmentLimits) {
    const [min, max] = state.definition.adjustmentLimits(state.values, index);
    values[index] = Math.max(adjustment.min, min, Math.min(adjustment.max, max, values[index]));
  }
  writeGraphicPreset(element, state, state.bounds, constrainCalloutTip(state.type, values, state.values));
  return true;
}
export {
  adjustGraphicPreset,
  graphicConnectorRole,
  graphicPresetAngle,
  graphicPresetFillRule,
  graphicPresetHandles,
  graphicPresetOptions,
  graphicPresetPath,
  isGraphicPresetType,
  readGraphicPreset,
  writeGraphicPreset
};
