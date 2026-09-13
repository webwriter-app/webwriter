export type DocumentLayoutMode = "document" | "canvas"
export type DocumentLayoutState = {mode: DocumentLayoutMode, canConvert: boolean, zoom: number}

/** Authored layout, retained in shared and exported HTML. Navigation is local. */
export const canvasClass = "ww-canvas"
export const canvasStyles = `
body.ww-canvas { position: relative; width: 1280px; min-height: 720px; }
body.ww-canvas > :not(style, script, link, meta, template) { position: absolute; }
`
