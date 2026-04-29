import { roundByDPR } from "#model/utility/index.js"
import { styleMap } from "lit/directives/style-map.js"
import { EditorController } from "."
import { css, CSSResult } from "lit"
import { computePosition, shift } from '@floating-ui/dom'

export class LayoutController extends EditorController {

  get isInNarrowLayout() {
		return document.documentElement.offsetWidth <= 1129
	}

  get isInWideLayout() {
    return document.documentElement.offsetWidth > 1380
  }

    get toolboxHeight() {
    return this.host.toolbox.clientHeight
  }

  get toolboxWidth() {
    return this.host.toolbox.clientWidth
  }

    get shiftPaddingStyling() {
    return this.isInWideLayout
      ? 27
      : 34 + Math.max(0, document.documentElement.offsetWidth - 1130)
  }

  autoUpdateElement: { element: Element, cleanup: () => void } | null = null


  updatePosition = async () => {
		const mode = this.toolboxMode
		const docEl = this.host.selection.activeElement?.ownerDocument.querySelector("body")
		const iframeEl = this.host.pmEditor?.iframe
    const iframeBody = this.host.pmEditor?.body
    const bodyWidth = iframeBody?.offsetWidth
		const docWidth = iframeEl?.clientWidth
    const docHeight = iframeEl?.clientHeight
    const rightEdge = docWidth - (docWidth - bodyWidth) / 2
    const iframeOffsetX = iframeEl?.getBoundingClientRect().x
    const iframeOffsetY = iframeEl?.getBoundingClientRect().y
    if(!this.host.selection || !this.host.selection.activeElement || !docEl || !iframeEl || !this.host.toolbox || !this.host.state.doc.content.size) {
      return
    }
		else if(mode === "popup") {
			const {y: yMin} = await computePosition(iframeEl, this.host.toolbox, {
				placement:  "right-start",
				strategy: "absolute",
			})
			const {y: yMax} = await computePosition(iframeEl, this.host.toolbox, {
				placement:  "right-end",
				strategy: "absolute",
				middleware: [
					shift({padding: {top: 5, bottom: 5}, boundary: iframeEl})
				]
			})
			const {bottom: anchorBottom, left: anchorLeft} = this.host.pmEditor.coordsAtPos(this.host.selection.selection.anchor)
			const {bottom: headBottom, left: headLeft} = this.host.pmEditor.coordsAtPos(this.host.selection.selection.head)
			this.host.toolboxX = roundByDPR(
          Math.min(
            Math.min(anchorLeft, headLeft) + iframeOffsetX,
            docWidth - this.host.toolbox.clientWidth - 20
          )
			)
			this.host.toolboxY = roundByDPR(Math.min(
				Math.max(anchorBottom, headBottom, yMin) + 2,
				yMax
			))
		}
		else if(mode === "right") {
			const {y} = await computePosition(this.host.selection.activeElement, this.host.toolbox, {
				placement:  "right-start",
				strategy: "fixed",
				middleware: []
			})
			this.host.toolboxX = roundByDPR(rightEdge + 1)
			this.host.toolboxY = roundByDPR(Math.max(
        Math.min(
          y,
          docHeight - this.host.toolbox.clientHeight + iframeOffsetY
        ),
        iframeOffsetY
      ))/*roundByDPR(
        Math.min(Math.max(selectionY, 0), yMax)
      )*/
      if(this.host.app.store.ui.stickyToolbox) {
        this.positionStyle = css`
          body {
            --ww-toolbox-action-x: ${this.host.toolboxX - iframeOffsetX + 10}px;
            --ww-toolbox-action-y: ${this.host.toolboxY + this.toolboxHeight - iframeOffsetY}px;
            --ww-toolbox-action-width: ${docWidth - rightEdge - 40}px;
            --ww-toolbox-action-height: ${docHeight + -this.host.toolboxY + -this.toolboxHeight}px
          }
        `
      }
      else {
        const toolboxX = this.host.toolbox.offsetLeft
        const toolboxY = this.host.toolbox.offsetTop
        const toolboxWidth = this.host.toolbox.offsetWidth
        this.positionStyle = css`
          body {
            --ww-toolbox-action-x: ${toolboxX + 10}px;
            --ww-toolbox-action-y: ${toolboxY + this.toolboxHeight}px;
            --ww-toolbox-action-width: ${toolboxWidth - 20}px;
            --ww-toolbox-action-height: ${docHeight + -toolboxY + -this.toolboxHeight - 20}px
          }
        `
      }
		}
  }

  set positionStyle(value: CSSResult) {
    const styles = value instanceof CSSResult? value.cssText: value
    this.host.pmEditor.document.adoptedStyleSheets = this.host.pmEditor.document.adoptedStyleSheets.filter(sheet => sheet !== this.positionStylesheet)
    this.positionStylesheet = new this.host.pmEditor.window.CSSStyleSheet()
    this.positionStylesheet.replaceSync(styles)
    this.host.pmEditor.document.adoptedStyleSheets.push(this.positionStylesheet)
  }

  set rootElementStyle(value: Record<string, string>) {
    this.rootElementStyle = {...this.#rootElementStyle, ...value}
    const props = Object.entries(this.rootElementStyle).map(([p,v])=>`${p}: ${v}`).join(";")
    const styles = `html { ${props} }`
    this.host.pmEditor.document.adoptedStyleSheets = this.host.pmEditor.document.adoptedStyleSheets.filter(sheet => sheet !== this.positionStylesheet)
    this.positionStylesheet = new this.host.pmEditor.window.CSSStyleSheet()
    this.positionStylesheet.replaceSync(styles)
    this.host.pmEditor.document.adoptedStyleSheets.push(this.positionStylesheet)
  }

  #rootElementStyle: Record<string, string> = {}

  positionStylesheet: CSSStyleSheet


  get toolboxMode(): "popup" | "right" | "hidden" {
    const isFullscreen = this.host.pmEditor?.isFullscreen
    if((this.isInNarrowLayout || isFullscreen) && this.host.forceToolboxPopup) return "popup"
    else if(!this.isInNarrowLayout) return "right"
    else return "hidden"
  }

  get toolboxStyle(): Parameters<typeof styleMap>[0] {
    const {toolboxMode} = this
    if(!this.host.app.store.ui.stickyToolbox && toolboxMode === "right") return {
      gridColumn: "6",
      gridRow: "1/3",
      width: "auto",
      justifySelf: "start",
      alignSelf: "start"
    }
    else if(toolboxMode === "popup") return {
      position: "absolute",
      left: `${this.host.toolboxX ?? 40}px`,
      top: `${this.host.toolboxY ?? 20}px`,
      border: "1px solid lightgray",
      padding: "12px",
      boxShadow: "var(--sl-shadow-medium)",
      transition: "top 0.1s, left 0.1s"
    }
    else if(toolboxMode === "right") return {
      position: "fixed",
      left: `${this.host.toolboxX}px`,
      top: `${this.host.toolboxY}px`,
      transition: "top 0.1s"
    }
    else return {
      display: "none",
      left: `${this.host.toolboxX}px`,
      top: `${this.host.toolboxY}px`
    }
  }

  hostDisconnected(): void {
    this.autoUpdateElement?.cleanup()
    this.autoUpdateElement = null
  }

  globalListeners = {
    "resize": () => { this.host.requestUpdate(); this.host.layout.updatePosition() }
  }
}