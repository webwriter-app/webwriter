export const isOverflownX = (el: Element) => el.scrollWidth > el.clientWidth
export const isOverflownY = (el: Element) => el.scrollHeight > el.clientHeight
export const isOverflown = (el: Element) => isOverflownX(el) || isOverflownY(el)