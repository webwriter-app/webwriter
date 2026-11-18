type Point = {x: number, y: number}
type TouchPinchSample = {zoom: number, previous: Point, point: Point}

function touchGeometry(first: Touch, second: Touch) {
  return {
    distance: Math.max(1, Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)),
    point: {x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2},
  }
}

/** A pinch owns two contacts that both started on the document surface. */
export class TouchPinch {
  private contacts = new Set<number>()
  private gesture: {ids: number[], zoom: number, distance: number, point: Point} | null = null

  get active() { return this.gesture !== null }

  start(event: TouchEvent, ownsStart: boolean, zoom: number): Point | null {
    const activeIds = new Set(Array.from(event.touches, touch => touch.identifier))
    for(const id of this.contacts) if(!activeIds.has(id)) this.contacts.delete(id)
    if(this.gesture?.ids.some(id => !activeIds.has(id))) this.gesture = null
    for(const touch of Array.from(event.changedTouches)) {
      if(ownsStart) this.contacts.add(touch.identifier)
      else this.contacts.delete(touch.identifier)
    }
    if(this.active || event.touches.length !== 2 || !event.cancelable) return null
    const first = event.touches[0], second = event.touches[1]
    const ids = [first.identifier, second.identifier]
    if(!ids.every(id => this.contacts.has(id))) return null
    // Cancel the two-finger start before the browser can claim it for page zoom.
    event.preventDefault()
    this.gesture = {ids, zoom, ...touchGeometry(first, second)}
    return this.gesture.point
  }

  move(event: TouchEvent): TouchPinchSample | null {
    const gesture = this.gesture
    if(!gesture || !Array.from(event.changedTouches).some(touch => gesture.ids.includes(touch.identifier))) return null
    const touches = Array.from(event.touches)
    const [first, second] = gesture.ids.map(id => touches.find(touch => touch.identifier === id))
    if(!first || !second) return null
    if(event.cancelable) event.preventDefault()
    const {distance, point} = touchGeometry(first, second)
    const sample = {zoom: gesture.zoom * distance / gesture.distance, previous: gesture.point, point}
    gesture.point = point
    return sample
  }

  end(event?: TouchEvent) {
    if(!event) {
      this.contacts.clear()
      this.gesture = null
      return
    }
    for(const touch of Array.from(event.changedTouches)) this.contacts.delete(touch.identifier)
    if(this.gesture?.ids.some(id => !this.contacts.has(id))) {
      if(event.cancelable) event.preventDefault()
      this.gesture = null
    }
  }
}
