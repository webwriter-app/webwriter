import {createImageMapPopoverController, imageMapHotspotBounds, imageMapHotspotShape, imageMapPopoverAppearance, imageMapScale, mountImageMapReader} from "./media"
import {createAnchorPositioner} from "./anchor-positioning.js"

const controller = createImageMapPopoverController(document,
  (area, image) => imageMapHotspotBounds(area, image, imageMapScale), imageMapPopoverAppearance)
const reader = mountImageMapReader(document, controller, imageMapHotspotShape, createAnchorPositioner, imageMapScale)
const handle = controller.handleEvent
document.addEventListener("click", handle)
document.addEventListener("pointerover", handle)
window.addEventListener("pagehide", () => {
  document.removeEventListener("click", handle)
  document.removeEventListener("pointerover", handle)
  reader.dispose()
}, {once: true})
