/** Native SVG recipes in a nominal 0..100 frame. Use absolute M/L/Q/C/Z
 * commands and coordinates affine in the adjustment values. This lets the
 * editor recover the frame and controls from d without private metadata.
 * Points identify authored endpoints or curve controls for the yellow handles. */
export type GraphicShapeAdjustment = {
  name: string
  label: string
  default: number
  min: number
  max: number
  axis: "x" | "y"
  point: (values: number[]) => {x: number, y: number}
}

export type GraphicShapePreset = {
  label: string
  category: string
  open?: boolean
  adjustments: GraphicShapeAdjustment[]
  draw: (values: number[]) => string
}

const a = (name: string, label: string, value: number, min: number, max: number, axis: "x" | "y" = "x"): GraphicShapeAdjustment => ({name, label, default: value, min, max, axis, point: values => axis === "x" ? {x: values[0] ?? value, y: 0} : {x: 0, y: values[0] ?? value}})
const v = (values: number[], i: number, fallback: number) => values[i] ?? fallback
const polygon = (points: number[][]) => `M ${points.map(p => `${p[0]} ${p[1]}`).join(" L ")} Z`
const ellipse = (cx = 50, cy = 50, rx = 50, ry = 50) => `M ${cx-rx} ${cy} C ${cx-rx} ${cy-ry*.5523} ${cx-rx*.5523} ${cy-ry} ${cx} ${cy-ry} C ${cx+rx*.5523} ${cy-ry} ${cx+rx} ${cy-ry*.5523} ${cx+rx} ${cy} C ${cx+rx} ${cy+ry*.5523} ${cx+rx*.5523} ${cy+ry} ${cx} ${cy+ry} C ${cx-rx*.5523} ${cy+ry} ${cx-rx} ${cy+ry*.5523} ${cx-rx} ${cy} Z`
const rect = (r = 0, inset = 0) => { const q = r; return `M ${inset+q} ${inset} L ${100-inset-q} ${inset} Q ${100-inset} ${inset} ${100-inset} ${inset+q} L ${100-inset} ${100-inset-q} Q ${100-inset} ${100-inset} ${100-inset-q} ${100-inset} L ${inset+q} ${100-inset} Q ${inset} ${100-inset} ${inset} ${100-inset-q} L ${inset} ${inset+q} Q ${inset} ${inset} ${inset+q} ${inset} Z` }
const base = (label: string, category: string, draw: (values: number[]) => string, adjustments: GraphicShapeAdjustment[]) => ({label, category, adjustments, draw})
const adjR = (label = "Corner radius") => [a("radius", label, 12, 0, 45)]
const star = (n: number, inner = 38) => (values: number[]) => { const ri = v(values, 0, inner); const p: number[][] = []; for (let i=0; i<n*2; i++) { const r = i%2 ? ri : 48; const t = -Math.PI/2 + i*Math.PI/n; p.push([50+r*Math.cos(t), 50+r*Math.sin(t)]) } return polygon(p) }


const poi = (name: string, label: string, value: number, min: number, max: number, point: (value: number) => {x: number, y: number}, axis: "x" | "y" = "x"): GraphicShapeAdjustment => ({
  name, label, default: value, min, max, axis, point: values => point(values[0]),
})

const turn = (path: string, quarters: number) => {
  const numbers = /[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g
  const values = Array.from(path.matchAll(numbers), m => Number(m[0]))
  for(let i = 0; i < values.length; i += 2) {
    for(let j = 0; j < quarters; j++) [values[i], values[i + 1]] = [100 - values[i + 1], values[i]]
  }
  let i = 0
  return path.replace(numbers, () => String(values[i++]))
}

const blockArrow = (label: string, direction: number) => base(label, "Block arrows", ([d]) => turn(polygon([
  [0,34],[100-d,34],[100-d,0],[100,50],[100-d,100],[100-d,66],[0,66],
]), direction), [poi("head", "Head depth", 30, 10, 65,
  p => direction === 1 ? {x:100,y:100-p} : direction === 2 ? {x:p,y:100} : {x:0,y:p}, direction % 2 ? "y" : "x")])

const quadArrow = (t: number, callout = false) => {
  const quarter = callout
    ? [[50,0],[70,18],[50+t,18],[50+t,30],[70,30],[70,50-t],[82,50-t],[82,30]]
    : [[50,0],[70,20],[50+t,20],[50+t,50-t],[80,50-t],[80,30]]
  const points: number[][] = []
  for(let q = 0; q < 4; q++) for(const source of quarter) {
    let [x,y] = source
    for(let i = 0; i < q; i++) [x,y] = [100-y,x]
    points.push([x,y])
  }
  return polygon(points)
}

const curvedArrow = (label: string, direction: number) => base(label, "Block arrows", ([t]) => turn(
  `M 90 0 C -20 0 -20 85 70 85 L 70 100 L 100 75 L 70 50 L 70 ${85-t} C ${t} ${85-t} ${t} ${t} 90 ${t} Z`, direction,
), [poi("thickness", "Band thickness", 14, 5, 25, p => direction === 0 ? {x:90,y:p} : direction === 1 ? {x:100-p,y:90} : direction === 2 ? {x:10,y:100-p} : {x:p,y:10}, direction % 2 ? "x" : "y")])

const arrowCallout = (label: string, direction: number) => base(label, "Block arrows", ([d]) => turn(polygon([
  [0,0],[d,0],[d,40],[80,40],[80,25],[100,50],[80,75],[80,60],[d,60],[d,100],[0,100],
]), direction), [poi("box", "Box width", 65, 30, 75, p => direction === 0 ? {x:p,y:0} : direction === 1 ? {x:100,y:p} : direction === 2 ? {x:100-p,y:100} : {x:0,y:100-p}, direction % 2 ? "y" : "x")])

const crossPath = (t: number) => polygon([[50-t/2,0],[50+t/2,0],[50+t/2,50-t/2],[100,50-t/2],[100,50+t/2],[50+t/2,50+t/2],[50+t/2,100],[50-t/2,100],[50-t/2,50+t/2],[0,50+t/2],[0,50-t/2],[50-t/2,50-t/2]])
const roundFlow = (r: number) => `M 0 50 C 0 ${50-r} ${50-r} 0 50 0 C ${50+r} 0 100 ${50-r} 100 50 C 100 ${50+r} ${50+r} 100 50 100 C ${50-r} 100 0 ${50+r} 0 50 Z`
const cylinderPath = (d: number) => `M 0 ${d} C 0 ${-d/3} 100 ${-d/3} 100 ${d} L 100 ${100-d} C 100 ${100+d/3} 0 ${100+d/3} 0 ${100-d} Z M 0 ${d} C 0 ${d*7/3} 100 ${d*7/3} 100 ${d}`

const irregularStar = (n: number, inner: number, variant: number) => polygon(Array.from({length:n*2}, (_,i) => {
  const theta = -Math.PI/2 + i*Math.PI/n
  const radius = i%2 ? inner : 40 + ((i*7 + variant*3)%11)
  return [50+radius*Math.cos(theta),50+radius*Math.sin(theta)]
}))
const starPreset = (n: number, inner: number) => base(`${n}-point star`, "Stars and banners", star(n), [poi("inner", "Inner radius", inner, 3, 44, p => ({x:50+p*Math.sin(Math.PI/n),y:50-p*Math.cos(Math.PI/n)}))])
const ribbonPreset = (label: string, down: boolean, curved: boolean) => base(label, "Stars and banners", ([d]) => {
  const path = curved
    ? `M 20 15 Q 50 ${15+d} 80 15 L 80 30 L 100 25 L 90 50 L 100 75 L 80 70 L 80 80 Q 50 ${80+d} 20 80 L 20 70 L 0 75 L 10 50 L 0 25 L 20 30 Z M 20 30 L 20 70 M 80 30 L 80 70 M 20 70 L 35 80 M 80 70 L 65 80`
    : `M 20 ${20-d/2} L 80 ${20-d/2} L 80 30 L 100 30 L 90 55 L 100 80 L 80 80 L 65 65 L 35 65 L 20 80 L 0 80 L 10 55 L 0 30 L 20 30 Z M 20 30 L 20 65 L 80 65 L 80 30 M 20 65 L 35 80 M 80 65 L 65 80`
  return down ? turn(path,2) : path
}, [poi("fold", curved ? "Ribbon curve" : "Fold depth", 15, 3, 28, p => ({x:50,y:down ? curved ? 85-p : 80+p/2 : curved ? 15+p : 20-p/2}), "y")])
const scrollPath = (d: number) => `M 20 ${d} Q 20 0 30 0 L 95 0 Q 100 ${d} 90 ${d} L 80 ${d} L 80 ${100-d} Q 80 100 70 100 L 5 100 Q 0 ${100-d} 10 ${100-d} L 20 ${100-d} Z M 30 0 Q 40 ${d} 30 ${d} L 20 ${d} M 70 100 Q 60 ${100-d} 70 ${100-d} L 80 ${100-d}`
const cloudBubble = () => "M 12 60 C -5 60 -3 38 10 35 C -2 18 12 10 25 15 C 28 -3 46 -3 50 10 C 63 -3 78 0 78 15 C 96 5 105 20 92 33 C 110 40 100 58 88 58 C 88 78 68 80 60 67 C 48 83 32 78 30 65 C 17 78 7 73 12 60 Z"
const calloutPreset = (label: string, form: "rectangle" | "rounded" | "oval") => base(label, "Callouts", ([p]) => {
  if(form === "oval") return `M 0 38 C 0 -12 100 -12 100 38 C 100 60 75 75 48 75 L ${p} 100 L 28 69 C 10 64 0 55 0 38 Z`
  if(form === "rounded") return `M 12 0 L 88 0 Q 100 0 100 12 L 100 63 Q 100 75 88 75 L 45 75 L ${p} 100 L 25 75 L 12 75 Q 0 75 0 63 L 0 12 Q 0 0 12 0 Z`
  return `M 0 0 L 100 0 L 100 75 L 45 75 L ${p} 100 L 25 75 L 0 75 Z`
}, [poi("tail", "Tail tip", 18, 0, 100, p => ({x:p,y:100}))])

export const graphicShapePresets = {
  "straight-arrow": {...base("Straight arrow", "Lines", ([p]) => `M 0 0 L 100 100 M ${100-p} 100 L 100 100 L 100 ${100-p}`, [poi("head", "Arrowhead size", 22, 8, 40, p => ({x:100-p,y:100}))]), open:true},
  "double-arrow": {...base("Double arrow", "Lines", ([p]) => `M 0 0 L 100 100 M ${100-p} 100 L 100 100 L 100 ${100-p} M 0 ${p} L 0 0 L ${p} 0`, [poi("head", "Arrowhead size", 22, 8, 40, p => ({x:p,y:0}))]), open:true},
  "elbow-connector": {...base("Elbow connector", "Lines", values => { const d=v(values,0,50); return `M 10 15 L ${d} 15 L ${d} 85 L 90 85` }, [a("bend", "Bend", 50, 15, 85)]), open:true},
  "elbow-connector-arrow": {...base("Elbow connector arrow", "Lines", ([p]) => `M 0 0 L ${p} 0 L ${p} 85 L 100 85 M 85 70 L 100 85 L 85 100`, [poi("bend", "Bend", 50, 15, 80, p => ({x:p,y:0}))]), open:true},
  "elbow-connector-double-arrow": {...base("Elbow connector double arrow", "Lines", ([p]) => `M 0 15 L ${p} 15 L ${p} 85 L 100 85 M 85 70 L 100 85 L 85 100 M 15 0 L 0 15 L 15 30`, [poi("bend", "Bend", 50, 20, 80, p => ({x:p,y:15}))]), open:true},
  "curved-connector": {...base("Curved connector", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100-p} 100 100 100`, [poi("bend", "Bend", 80, 10, 90, p => ({x:p,y:0}))]), open:true},
  "curved-connector-arrow": {...base("Curved connector arrow", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100-p} 100 100 100 M 85 85 L 100 100 L 82 100`, [poi("bend", "Bend", 80, 10, 90, p => ({x:p,y:0}))]), open:true},
  "curved-connector-double-arrow": {...base("Curved connector double arrow", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100-p} 100 100 100 M 85 85 L 100 100 L 82 100 M 15 15 L 0 0 L 18 0`, [poi("bend", "Bend", 80, 10, 90, p => ({x:p,y:0}))]), open:true},
  "curve": {...base("Curve", "Lines", ([p]) => `M 0 70 C 20 0 ${p} 0 50 50 C ${100-p} 100 80 100 100 70`, [poi("curve", "Curve control", 40, 10, 60, p => ({x:p,y:0}))]), open:true},
  "square-rectangle": base("Square rectangle", "Rectangles", ([r]) => rect(r), [poi("radius", "Corner radius", 0, 0, 45, p => ({x:p,y:0}))]),
  "rounded-rectangle": base("Rounded rectangle", "Rectangles", values => rect(v(values,0,12)), adjR()),
  "snip-one": base("Snip one corner", "Rectangles", values => polygon([[v(values,0,15),0],[100,0],[100,100],[0,100],[0,v(values,0,15)]]), [a("snip", "Snip",15,0,45)]),
  "snip-same-side": base("Snip same side", "Rectangles", values => polygon([[v(values,0,15),0],[100-v(values,0,15),0],[100, v(values,0,15)],[100,100],[0,100],[0,v(values,0,15)]]), [a("snip", "Snip",15,0,45)]),
  "snip-diagonal": base("Snip diagonal", "Rectangles", values => polygon([[v(values,0,15),0],[100,0],[100,100-v(values,0,15)],[100-v(values,0,15),100],[0,100],[0,v(values,0,15)]]), [a("snip", "Snip",15,0,45)]),
  "snip-round": base("Snip round", "Rectangles", values => `M ${v(values,0,15)} 0 L 100 0 L 100 ${100-v(values,0,15)} Q 100 100 ${100-v(values,0,15)} 100 L 0 100 L 0 ${v(values,0,15)} Z`, [a("snip", "Snip",15,0,45)]),
  "round-one": base("Round one corner", "Rectangles", values => `M ${v(values,0,20)} 0 L 100 0 L 100 100 L 0 100 L 0 ${v(values,0,20)} Q 0 0 ${v(values,0,20)} 0 Z`, adjR()),
  "round-same-side": base("Round same side", "Rectangles", values => `M ${v(values,0,20)} 0 L ${100-v(values,0,20)} 0 Q 100 0 100 ${v(values,0,20)} L 100 100 L 0 100 L 0 ${v(values,0,20)} Q 0 0 ${v(values,0,20)} 0 Z`, adjR()),
  "round-diagonal": base("Round diagonal", "Rectangles", values => `M ${v(values,0,20)} 0 L 100 0 L 100 ${100-v(values,0,20)} Q 100 100 ${100-v(values,0,20)} 100 L 0 100 L 0 ${v(values,0,20)} Q 0 0 ${v(values,0,20)} 0 Z`, adjR()),
  "text-box": base("Text box", "Basic shapes", values => rect(v(values,0,4), 3), [a("radius", "Radius",4,0,15)]),
  "right-triangle": base("Right triangle", "Basic shapes", ([p]) => polygon([[p,0],[100,100],[0,100]]), [poi("apex", "Apex position", 0, 0, 100, p => ({x:p,y:0}))]),
  "parallelogram": base("Parallelogram", "Basic shapes", values => { const d=v(values,0,18); return polygon([[d,0],[100,0],[100-d,100],[0,100]]) }, [a("slant", "Slant",18,0,45)]),
  "trapezoid": base("Trapezoid", "Basic shapes", values => { const d=v(values,0,25); return polygon([[d,0],[100-d,0],[100,100],[0,100]]) }, [a("top-inset", "Top inset",25,0,45)]),
  "pentagon": base("Pentagon", "Basic shapes", values => { const d=v(values,0,38); return polygon([[50,0],[100,d],[82,100],[18,100],[0,d]]) }, [poi("shoulder", "Shoulder height",38,15,48,p => ({x:100,y:p}),"y")]),
  "heptagon": base("Heptagon", "Basic shapes", values => { const d=v(values,0,19); return polygon([[50,0],[89,d],[98,62],[72,100],[28,100],[2,62],[11,d]]) }, [poi("shoulder", "Shoulder height",19,8,35,p => ({x:89,y:p}),"y")]),
  "octagon": base("Octagon", "Basic shapes", values => { const d=v(values,0,25); return polygon([[d,0],[100-d,0],[100, d],[100,100-d],[100-d,100],[d,100],[0,100-d],[0,d]]) }, [a("corner", "Corner",25,5,45)]),
  "decagon": base("Decagon", "Basic shapes", values => { const d=v(values,0,7); return polygon([[50,0],[79,d],[98,35],[98,65],[79,93],[50,100],[21,93],[2,65],[2,35],[21,d]]) }, [poi("shoulder", "Shoulder height",7,0,20,p => ({x:79,y:p}),"y")]),
  "dodecagon": base("Dodecagon", "Basic shapes", values => { const d=v(values,0,13); return polygon([[37,0],[63,0],[87,d],[100,37],[100,63],[87,87],[63,100],[37,100],[13,87],[0,63],[0,37],[13,d]]) }, [poi("shoulder", "Shoulder height",13,2,25,p => ({x:87,y:p}),"y")]),
  "pie": base("Pie", "Basic shapes", ([p]) => `M 50 50 L 100 ${p} C 100 78 78 100 50 100 C 22 100 0 78 0 50 C 0 22 22 0 50 0 L 50 50 Z`, [poi("sweep", "Sector edge", 50, 5, 75, p => ({x:100,y:p}), "y")]),
  "chord": base("Chord", "Basic shapes", ([p]) => `M ${p} 0 C 0 0 0 100 50 100 C 75 100 90 88 100 75 Z`, [poi("chord", "Chord endpoint", 50, 20, 80, p => ({x:p,y:0}))]),
  "teardrop": base("Teardrop", "Basic shapes", values => `M 50 0 C 75 32 95 52 82 78 C 68 ${100-v(values,0,6)} 32 ${100-v(values,0,6)} 18 78 C 5 52 25 32 50 0 Z`, [poi("bulge", "Bulge",6,0,25,p => ({x:68,y:100-p}),"y")]),
  "frame": base("Frame", "Basic shapes", values => `${rect(0)} ${rect(0, v(values,0,15))}`, [poi("thickness", "Frame thickness",15,2,35,p => ({x:p,y:p}))]),
  "half-frame": base("Half frame", "Basic shapes", ([d]) => polygon([[0,0],[100,0],[100-d,d],[d,d],[d,100-d],[0,100]]), [poi("thickness", "Frame thickness", 25, 5, 45, p => ({x:p,y:p}))]),
  "corner": base("L corner", "Basic shapes", ([d]) => polygon([[0,0],[d,0],[d,100-d],[100,100-d],[100,100],[0,100]]), [poi("thickness", "Arm thickness", 35, 5, 65, p => ({x:p,y:0}))]),
  "diagonal-stripe": base("Diagonal stripe", "Basic shapes", ([d]) => polygon([[100-d,0],[100,0],[0,100],[0,100-d]]), [poi("width", "Stripe width", 40, 5, 80, p => ({x:100-p,y:0}))]),
  "plus": base("Plus", "Basic shapes", values => { const d=v(values,0,30); return polygon([[d,0],[100-d,0],[100-d,d],[100,d],[100,100-d],[100-d,100-d],[100-d,100],[d,100],[d,100-d],[0,100-d],[0,d],[d,d]]) }, [a("arm", "Arm width",30,5,45)]),
  "plaque": base("Plaque", "Basic shapes", ([r]) => `M ${r} 0 L ${100-r} 0 Q ${100-r} ${r} 100 ${r} L 100 ${100-r} Q ${100-r} ${100-r} ${100-r} 100 L ${r} 100 Q ${r} ${100-r} 0 ${100-r} L 0 ${r} Q ${r} ${r} ${r} 0 Z`, [poi("radius", "Corner cutout", 18, 3, 40, p => ({x:p,y:0}))]),
  "cylinder": base("Cylinder", "Basic shapes", values => { const d=v(values,0,16); return `M 5 ${d+2} C 5 2 95 2 95 ${d+2} L 95 ${100-d} C 95 98 5 98 5 ${100-d} Z M 5 ${d+2} C 5 ${d*2+2} 95 ${d*2+2} 95 ${d+2}` }, [poi("depth", "Cap depth",16,4,35,p => ({x:5,y:p+2}),"y")]),
  "cube": base("Cube", "Basic shapes", ([d]) => `M ${d} 0 L 100 0 L 100 ${100-d} L ${100-d} 100 L 0 100 L 0 ${d} Z M 0 ${d} L ${100-d} ${d} L 100 0 M ${100-d} ${d} L ${100-d} 100`, [poi("depth", "Depth", 25, 5, 45, p => ({x:p,y:0}))]),
  "donut": base("Donut", "Basic shapes", values => `${ellipse()} ${ellipse(50,50,v(values,0,25),v(values,0,25))}`, [poi("hole", "Hole radius",25,5,45,p => ({x:50+p,y:50}))]),
  "prohibited": base("No / prohibited", "Basic shapes", ([r]) => `${ellipse()} M ${50-r*.7} ${50-r*.7} C ${50-r*1.5} ${50+r*.2} ${50-r*.2} ${50+r*1.5} ${50+r*.7} ${50+r*.7} Z M ${50+r*.7} ${50+r*.7-12} C ${50+r*1.5} ${50-r*.2} ${50+r*.2} ${50-r*1.5} ${50-r*.7+12} ${50-r*.7} Z`, [poi("hole", "Inner radius", 35, 20, 40, p => ({x:50-p*.7,y:50-p*.7}))]),
  "block-arc": base("Block arc", "Basic shapes", ([r]) => `M 0 100 C 0 -33.333 100 -33.333 100 100 L ${50+r} 100 C ${50+r} ${100-r*2.66666} ${50-r} ${100-r*2.66666} ${50-r} 100 Z`, [poi("inner", "Inner radius", 30, 8, 43, p => ({x:50+p,y:100}))]),
  "folded-corner": base("Folded corner", "Basic shapes", ([d]) => `M 0 0 L 100 0 L 100 ${100-d} L ${100-d} 100 L 0 100 Z M 100 ${100-d} L ${100-d} ${100-d} L ${100-d} 100`, [poi("fold", "Fold size", 18, 5, 45, p => ({x:100-p,y:100}))]),
  "heart": base("Heart", "Basic shapes", values => { const d=v(values,0,22); return `M 50 90 C 42 80 5 55 5 28 C 5 5 35 0 50 ${d} C 65 0 95 5 95 28 C 95 55 58 80 50 90 Z` }, [poi("cleft", "Cleft depth",22,5,40,p => ({x:50,y:p}),"y")]),
  "lightning-bolt": base("Lightning bolt", "Basic shapes", values => { const d=v(values,0,20); return polygon([[55,0],[d,55],[45,55],[35,100],[82,38],[55,38]]) }, [a("width", "Width",20,5,35)]),
  "sun": base("Sun", "Basic shapes", ([r]) => `${ellipse(50,50,25,25)} ${Array.from({length:8}, (_,i) => { const t=i*Math.PI/4; return polygon([[50+48*Math.cos(t),50+48*Math.sin(t)],[50+r*Math.cos(t-.2),50+r*Math.sin(t-.2)],[50+r*Math.cos(t+.2),50+r*Math.sin(t+.2)]]) }).join(" ")}`, [poi("ray", "Ray inner radius", 34, 29, 42, p => ({x:50+p*Math.cos(.2),y:50+p*Math.sin(.2)}))]),
  "moon": base("Moon", "Basic shapes", values => { const d=v(values,0,20); return `M ${75-d/2} 8 C 40 18 30 65 65 92 C 45 92 15 78 10 52 C 5 25 35 3 ${75-d/2} 8 Z` }, [poi("crescent", "Crescent width",20,5,40,p => ({x:75-p/2,y:8}))]),
  "cloud": base("Cloud", "Basic shapes", ([p]) => cloudBubble().replace("46 -3", `46 ${p}`), [poi("puff", "Cloud lobe", -3, -10, 10, p => ({x:46,y:p}), "y")]),
  "arc": {...base("Arc", "Basic shapes", ([p]) => `M 0 0 C ${p} 0 100 ${100-p} 100 100`, [poi("curve", "Curve control", 55.23, 10, 90, p => ({x:p,y:0}))]), open:true},
  "parentheses": {...base("Parentheses pair", "Basic shapes", values => { const d=v(values,0,20); return `M 38 5 C ${38-d} 25 ${38-d} 75 38 95 M 62 5 C ${62+d} 25 ${62+d} 75 62 95` }, [poi("curve", "Curve",20,5,35,p => ({x:38-p,y:25}))]), open:true},
  "braces": {...base("Braces pair", "Basic shapes", values => { const d=v(values,0,12); return `M 42 5 Q ${42-d} 5 32 25 L 32 40 Q 32 50 20 50 Q 32 50 32 60 L 32 75 Q ${42-d} 95 42 95 M 58 5 Q ${58+d} 5 68 25 L 68 40 Q 68 50 80 50 Q 68 50 68 60 L 68 75 Q ${58+d} 95 58 95` }, [poi("curve", "Curve",12,2,25,p => ({x:42-p,y:5}))]), open:true},
  "left-bracket": {...base("Left bracket", "Basic shapes", ([r]) => `M 75 0 L ${25+r} 0 Q 25 0 25 ${r} L 25 ${100-r} Q 25 100 ${25+r} 100 L 75 100`, [poi("radius", "Corner radius", 0, 0, 30, p => ({x:25+p,y:0}))]), open:true},
  "right-bracket": {...base("Right bracket", "Basic shapes", ([r]) => `M 25 0 L ${75-r} 0 Q 75 0 75 ${r} L 75 ${100-r} Q 75 100 ${75-r} 100 L 25 100`, [poi("radius", "Corner radius", 0, 0, 30, p => ({x:75-p,y:0}))]), open:true},
  "left-brace": {...base("Left brace", "Basic shapes", values => `M 70 5 Q 48 5 52 25 L 52 40 Q 52 50 ${v(values,0,25)} 50 Q 52 50 52 60 L 52 75 Q 48 95 70 95`, [poi("width", "Brace width",25,5,45,p => ({x:p,y:50}))]), open:true},
  "right-brace": {...base("Right brace", "Basic shapes", values => `M 30 5 Q 52 5 48 25 L 48 40 Q 48 50 ${100-v(values,0,25)} 50 Q 48 50 48 60 L 48 75 Q 52 95 30 95`, [poi("width", "Brace width",25,5,45,p => ({x:100-p,y:50}))]), open:true},
  "left-arrow": blockArrow("Left arrow", 2),
  "up-arrow": blockArrow("Up arrow", 3),
  "down-arrow": blockArrow("Down arrow", 1),
  "left-right-arrow": base("Left-right arrow", "Block arrows", ([d]) => polygon([[0,50],[d,0],[d,34],[100-d,34],[100-d,0],[100,50],[100-d,100],[100-d,66],[d,66],[d,100]]), [poi("head", "Head depth", 25, 8, 44, p => ({x:p,y:0}))]),
  "up-down-arrow": base("Up-down arrow", "Block arrows", ([d]) => turn(polygon([[0,50],[d,0],[d,34],[100-d,34],[100-d,0],[100,50],[100-d,100],[100-d,66],[d,66],[d,100]]), 1), [poi("head", "Head depth", 25, 8, 44, p => ({x:100,y:p}), "y")]),
  "quad-arrow": base("Quad arrow", "Block arrows", ([t]) => quadArrow(t), [poi("shaft", "Shaft half-width", 10, 4, 16, p => ({x:50+p,y:25}))]),
  "left-right-up-arrow": base("Left-right-up arrow", "Block arrows", ([t]) => polygon([[0,65],[25,40],[25,55],[50-t,55],[50-t,25],[25,25],[50,0],[75,25],[50+t,25],[50+t,55],[75,55],[75,40],[100,65],[75,90],[75,75],[25,75],[25,90]]), [poi("shaft", "Shaft half-width", 10, 4, 18, p => ({x:50+p,y:25}))]),
  "bent-arrow": base("Bent arrow", "Block arrows", ([t]) => `M 0 100 L 0 40 Q 0 10 30 10 L 70 10 L 70 0 L 100 25 L 70 50 L 70 ${10+t} L 30 ${10+t} Q ${t} ${10+t} ${t} 40 L ${t} 100 Z`, [poi("thickness", "Shaft thickness", 20, 8, 30, p => ({x:p,y:100}))]),
  "u-turn-arrow": base("U-turn arrow", "Block arrows", ([t]) => `M 0 100 L 0 38 C 0 -12 80 -12 80 38 L 80 60 L 100 60 L 70 90 L 40 60 L ${80-t} 60 L ${80-t} 38 C ${80-t} ${-12+t} ${t} ${-12+t} ${t} 38 L ${t} 100 Z`, [poi("thickness", "Shaft thickness", 18, 8, 28, p => ({x:p,y:100}))]),
  "left-up-arrow": base("Left-up arrow", "Block arrows", ([t]) => polygon([[0,75],[25,50],[25,65],[65,65],[65,25],[50,25],[75,0],[100,25],[85,25],[85,85],[25,85],[25,100]]).replace("65 65", `${65-t} ${65-t}`).replace("65 25", `${65-t} 25`).replace("25 65", `25 ${65-t}`), [poi("thickness", "Bend thickness", 0, -10, 15, p => ({x:65-p,y:65-p}))]),
  "bent-up-arrow": base("Bent-up arrow", "Block arrows", ([t]) => polygon([[0,100],[0,100-t],[65,100-t],[65,25],[50,25],[75,0],[100,25],[85,25],[85,100]]), [poi("thickness", "Base thickness", 20, 8, 40, p => ({x:0,y:100-p}), "y")]),
  "curved-left-arrow": curvedArrow("Curved left arrow", 2),
  "curved-right-arrow": curvedArrow("Curved right arrow", 0),
  "curved-up-arrow": curvedArrow("Curved up arrow", 3),
  "curved-down-arrow": curvedArrow("Curved down arrow", 1),
  "striped-right-arrow": base("Striped right arrow", "Block arrows", ([d]) => `M 25 35 L ${100-d} 35 L ${100-d} 0 L 100 50 L ${100-d} 100 L ${100-d} 65 L 25 65 Z M 0 35 L 5 35 L 5 65 L 0 65 Z M 12 35 L 19 35 L 19 65 L 12 65 Z`, [poi("head", "Head depth", 30, 15, 55, p => ({x:100-p,y:0}))]),
  "notched-right-arrow": base("Notched right arrow", "Block arrows", ([d]) => polygon([[0,30],[65,30],[65,0],[100,50],[65,100],[65,70],[0,70],[d,50]]), [poi("notch", "Notch depth", 15, 3, 40, p => ({x:p,y:50}))]),
  "home-plate": base("Pentagon arrow", "Block arrows", ([d]) => polygon([[0,0],[100-d,0],[100,50],[100-d,100],[0,100]]), [poi("head", "Point depth", 30, 5, 70, p => ({x:100-p,y:0}))]),
  "chevron": base("Chevron", "Block arrows", ([d]) => polygon([[0,0],[100-d,0],[100,50],[100-d,100],[0,100],[d,50]]), [poi("depth", "Point depth", 30, 5, 48, p => ({x:p,y:50}))]),
  "right-arrow-callout": arrowCallout("Right arrow callout", 0),
  "down-arrow-callout": arrowCallout("Down arrow callout", 1),
  "left-arrow-callout": arrowCallout("Left arrow callout", 2),
  "up-arrow-callout": arrowCallout("Up arrow callout", 3),
  "left-right-arrow-callout": base("Left-right arrow callout", "Block arrows", ([d]) => polygon([[0,50],[18,30],[18,42],[d,42],[d,15],[100-d,15],[100-d,42],[82,42],[82,30],[100,50],[82,70],[82,58],[100-d,58],[100-d,85],[d,85],[d,58],[18,58],[18,70]]), [poi("inset", "Box inset", 30, 20, 40, p => ({x:p,y:15}))]),
  "quad-arrow-callout": base("Quad arrow callout", "Block arrows", ([t]) => quadArrow(t, true), [poi("shaft", "Shaft half-width", 7, 3, 12, p => ({x:50+p,y:18}))]),
  "circular-arrow": base("Circular arrow", "Block arrows", ([t]) => `M 10 70 C -10 30 15 0 50 0 C 75 0 95 20 95 45 L 100 45 L 85 68 L 65 45 L ${95-t} 45 C ${95-t} ${20+t} 75 ${t} 50 ${t} C ${15+t} ${t} ${t} 30 ${10+t} 70 Z`, [poi("thickness", "Band thickness", 12, 5, 22, p => ({x:50,y:p}), "y")]),
  "equation-plus": base("Plus sign", "Equation shapes", ([t]) => crossPath(t), [poi("thickness", "Bar thickness", 24, 8, 45, p => ({x:50+p/2,y:0}))]),
  "equation-minus": base("Minus", "Equation shapes", ([r]) => `M ${r} 38 L ${100-r} 38 Q 100 38 100 ${38+r} L 100 ${62-r} Q 100 62 ${100-r} 62 L ${r} 62 Q 0 62 0 ${62-r} L 0 ${38+r} Q 0 38 ${r} 38 Z`, [poi("roundness", "Corner roundness", 0, 0, 10, p => ({x:p,y:38}))]),
  "multiply": base("Multiply", "Equation shapes", ([t]) => polygon([[t,0],[50,50-t],[100-t,0],[100,t],[50+t,50],[100,100-t],[100-t,100],[50,50+t],[t,100],[0,100-t],[50-t,50],[0,t]]), [poi("thickness", "Bar width", 20, 6, 35, p => ({x:p,y:0}))]),
  "divide": base("Divide", "Equation shapes", ([r]) => `M 0 40 L 100 40 L 100 60 L 0 60 Z ${ellipse(50,15,r,r)} ${ellipse(50,85,r,r)}`, [poi("dot", "Dot radius", 10, 4, 14, p => ({x:50+p,y:15}))]),
  "equal": base("Equal", "Equation shapes", ([t]) => `M 0 15 L 100 15 L 100 ${15+t} L 0 ${15+t} Z M 0 ${85-t} L 100 ${85-t} L 100 85 L 0 85 Z`, [poi("thickness", "Bar thickness", 20, 8, 30, p => ({x:50,y:15+p}), "y")]),
  "not-equal": {...base("Not equal", "Equation shapes", ([s]) => `M 0 25 L ${50-s} 25 L ${65-s} 0 L 80 0 L 65 25 L 100 25 L 100 42 L 55 42 L 45 58 L 100 58 L 100 75 L 35 75 L 20 100 L ${5+s} 100 L ${20+s} 75 L 0 75 L 0 58 L ${30+s} 58 L ${40+s} 42 L 0 42 Z`, [poi("slash", "Slash width", 0, -5, 5, p => ({x:50-p,y:25}))]),},
  "process": base("Process", "Flowchart", ([r]) => rect(r), [poi("roundness", "Corner roundness", 0, 0, 12, p => ({x:p,y:0}))]),
  "alternate-process": base("Alternate process", "Flowchart", ([r]) => rect(r), [poi("radius", "Corner radius", 15, 0, 45, p => ({x:p,y:0}))]),
  "decision": base("Decision", "Flowchart", ([p]) => polygon([[p,0],[100,50],[p,100],[0,50]]), [poi("apex", "Apex position", 50, 15, 85, p => ({x:p,y:0}))]),
  "data": base("Data", "Flowchart", ([s]) => polygon([[s,0],[100,0],[100-s,100],[0,100]]), [poi("slant", "Slant", 20, 0, 45, p => ({x:p,y:0}))]),
  "predefined-process": base("Predefined process", "Flowchart", ([m]) => `${rect()} M ${m} 0 L ${m} 100 M ${100-m} 0 L ${100-m} 100`, [poi("margin", "Side margin", 12, 3, 35, p => ({x:p,y:0}))]),
  "internal-storage": base("Internal storage", "Flowchart", ([m]) => `${rect()} M ${m} 0 L ${m} 100 M 0 ${m} L 100 ${m}`, [poi("margin", "Header margin", 15, 5, 40, p => ({x:p,y:p}))]),
  "document": base("Document", "Flowchart", ([d]) => `M 0 0 L 100 0 L 100 85 C 65 ${85-d} 35 ${85+d} 0 85 Z`, [poi("wave", "Wave depth", 20, 3, 35, p => ({x:35,y:85+p}), "y")]),
  "multidocument": base("Multiple documents", "Flowchart", ([d]) => `M 0 15 L 85 15 L 85 85 C 55 ${85-d} 30 ${85+d} 0 85 Z M 8 8 L 93 8 L 93 78 M 15 0 L 100 0 L 100 70`, [poi("wave", "Wave depth", 15, 3, 30, p => ({x:30,y:85+p}), "y")]),
  "terminator": base("Terminator", "Flowchart", ([r]) => `M ${r} 25 L ${100-r} 25 C 100 25 100 75 ${100-r} 75 L ${r} 75 C 0 75 0 25 ${r} 25 Z`, [poi("roundness", "End roundness", 25, 5, 45, p => ({x:p,y:25}))]),
  "preparation": base("Preparation", "Flowchart", ([p]) => polygon([[p,0],[100-p,0],[100,50],[100-p,100],[p,100],[0,50]]), [poi("point", "Point depth", 22, 5, 40, p => ({x:p,y:0}))]),
  "manual-input": base("Manual input", "Flowchart", ([s]) => polygon([[0,s],[100,0],[100,100],[0,100]]), [poi("slope", "Top slope", 22, 0, 60, p => ({x:0,y:p}), "y")]),
  "manual-operation": base("Manual operation", "Flowchart", ([s]) => polygon([[0,0],[100,0],[100-s,100],[s,100]]), [poi("inset", "Bottom inset", 20, 0, 45, p => ({x:p,y:100}))]),
  "flowchart-connector": base("Connector", "Flowchart", ([r]) => roundFlow(r), [poi("curvature", "Curvature", 27.615, 15, 38, p => ({x:50+p,y:0}))]),
  "offpage-connector": base("Off-page connector", "Flowchart", ([p]) => polygon([[0,0],[100,0],[100,p],[50,100],[0,p]]), [poi("point", "Shoulder height", 75, 30, 95, p => ({x:100,y:p}), "y")]),
  "card": base("Card", "Flowchart", ([p]) => polygon([[p,0],[100,0],[100,100],[0,100],[0,p]]), [poi("corner", "Clipped corner", 25, 0, 65, p => ({x:p,y:0}))]),
  "punched-tape": base("Punched tape", "Flowchart", ([d]) => `M 0 15 C 30 ${15+d} 70 ${15-d} 100 15 L 100 85 C 70 ${85-d} 30 ${85+d} 0 85 Z`, [poi("wave", "Wave depth", 20, 3, 35, p => ({x:30,y:15+p}), "y")]),
  "summing-junction": base("Summing junction", "Flowchart", ([r]) => `${roundFlow(r)} M 15 15 L 85 85 M 15 85 L 85 15`, [poi("curvature", "Curvature", 27.615, 15, 38, p => ({x:50+p,y:0}))]),
  "or": base("Or", "Flowchart", ([r]) => `${roundFlow(r)} M 0 50 L 100 50 M 50 0 L 50 100`, [poi("curvature", "Curvature", 27.615, 15, 38, p => ({x:50+p,y:0}))]),
  "collate": base("Collate", "Flowchart", ([p]) => polygon([[0,0],[100,0],[0,100],[100,100],[p,50]]), [poi("waist", "Waist position", 50, 35, 65, p => ({x:p,y:50}))]),
  "sort": base("Sort", "Flowchart", ([p]) => `${polygon([[50,0],[100,p],[50,100],[0,p]])} M 0 ${p} L 100 ${p}`, [poi("division", "Division height", 50, 20, 80, p => ({x:0,y:p}), "y")]),
  "extract": base("Extract", "Flowchart", ([p]) => polygon([[p,0],[100,100],[0,100]]), [poi("apex", "Apex position", 50, 10, 90, p => ({x:p,y:0}))]),
  "merge": base("Merge", "Flowchart", ([p]) => polygon([[0,0],[100,0],[p,100]]), [poi("apex", "Apex position", 50, 10, 90, p => ({x:p,y:100}))]),
  "stored-data": base("Stored data", "Flowchart", ([r]) => `M ${r} 0 L 100 0 C ${100-r} 0 ${100-r} 100 100 100 L ${r} 100 C 0 100 0 0 ${r} 0 Z`, [poi("curve", "End curvature", 20, 5, 40, p => ({x:p,y:0}))]),
  "delay": base("Delay", "Flowchart", ([r]) => `M 0 0 L ${100-r} 0 C 100 0 100 100 ${100-r} 100 L 0 100 Z`, [poi("curve", "End curvature", 45, 10, 70, p => ({x:100-p,y:0}))]),
  "sequential-access-storage": base("Sequential access storage", "Flowchart", ([t]) => `${ellipse(45,45,45,45)} M 45 90 L 100 90 L 100 ${90-t} L 75 ${90-t}`, [poi("tail", "Tail height", 10, 3, 25, p => ({x:100,y:90-p}), "y")]),
  "magnetic-disk": base("Magnetic disk", "Flowchart", ([d]) => cylinderPath(d), [poi("depth", "Cap depth", 15, 5, 30, p => ({x:0,y:p}), "y")]),
  "direct-access-storage": base("Direct access storage", "Flowchart", ([d]) => turn(cylinderPath(d), 1), [poi("depth", "Cap depth", 15, 5, 30, p => ({x:100-p,y:0}))]),
  "display": base("Display", "Flowchart", ([d]) => `M ${d} 0 L 80 0 C 100 0 100 100 80 100 L ${d} 100 L 0 50 Z`, [poi("point", "Point depth", 20, 5, 50, p => ({x:p,y:0}))]),
  "seal-1": base("Explosion 1", "Stars and banners", ([p]) => irregularStar(12,p,0), [poi("inner", "Inner radius", 26, 8, 38, p => ({x:50+p,y:50}))]),
  "seal-2": base("Explosion 2", "Stars and banners", ([p]) => irregularStar(16,p,1), [poi("inner", "Inner radius", 32, 8, 38, p => ({x:50+p,y:50}))]),
  "star-4": starPreset(4, 12),
  "star-6": starPreset(6, 25),
  "star-7": starPreset(7, 30),
  "star-8": starPreset(8, 30),
  "star-10": starPreset(10, 34),
  "star-12": starPreset(12, 34),
  "star-16": starPreset(16, 36),
  "star-24": starPreset(24, 39),
  "star-32": starPreset(32, 41),
  "ribbon-up": ribbonPreset("Ribbon up", false, false),
  "ribbon-down": ribbonPreset("Ribbon down", true, false),
  "curved-ribbon-up": ribbonPreset("Curved ribbon up", false, true),
  "curved-ribbon-down": ribbonPreset("Curved ribbon down", true, true),
  "vertical-scroll": base("Vertical scroll", "Stars and banners", ([d]) => scrollPath(d), [poi("curl", "Curl depth", 10, 4, 18, p => ({x:80,y:p}), "y")]),
  "horizontal-scroll": base("Horizontal scroll", "Stars and banners", ([d]) => turn(scrollPath(d),1), [poi("curl", "Curl depth", 10, 4, 18, p => ({x:100-p,y:80}))]),
  "wave": base("Wave", "Stars and banners", ([d]) => `M 0 20 C 35 ${20-d} 65 ${20+d} 100 20 L 100 80 C 65 ${80+d} 35 ${80-d} 0 80 Z`, [poi("amplitude", "Wave amplitude", 30, 5, 45, p => ({x:35,y:20-p}), "y")]),
  "double-wave": base("Double wave", "Stars and banners", ([d]) => `M 0 20 Q 25 ${20-d} 50 20 Q 75 ${20+d} 100 20 L 100 80 Q 75 ${80+d} 50 80 Q 25 ${80-d} 0 80 Z`, [poi("amplitude", "Wave amplitude", 25, 5, 40, p => ({x:25,y:20-p}), "y")]),
  "rectangular-callout": calloutPreset("Rectangular callout", "rectangle"),
  "rounded-rectangular-callout": calloutPreset("Rounded rectangular callout", "rounded"),
  "oval-callout": calloutPreset("Oval callout", "oval"),
  "cloud-callout": base("Cloud callout", "Callouts", ([p]) => `${cloudBubble()} ${ellipse(22,86,5,4)} ${ellipse(p,96,3,2)}`, [poi("tail", "Thought tail position", 14, 4, 45, p => ({x:p,y:96}))]),
  "line-callout-1": base("Line callout 1", "Callouts", ([p]) => `M 30 0 L 100 0 L 100 75 L 30 75 Z M 28 15 L ${p} 100`, [poi("tail", "Leader endpoint", 5, 0, 25, p => ({x:p,y:100}))]),
  "line-callout-2": base("Line callout 2", "Callouts", ([p]) => `M 30 0 L 100 0 L 100 75 L 30 75 Z M 28 15 L 18 15 L ${p} 100`, [poi("tail", "Leader endpoint", 5, 0, 25, p => ({x:p,y:100}))]),
} satisfies Record<string, GraphicShapePreset>
