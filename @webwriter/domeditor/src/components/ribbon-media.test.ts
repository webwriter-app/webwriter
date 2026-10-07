// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import {DomEditorToolbox} from "./toolbox"

beforeEach(() => document.body.replaceChildren())

describe("media ribbon drawer", () => {
  it("dispatches the Image insertion command from a Start media button", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const image = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="Image"]',
    )!
    await image.updateComplete

    image.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener.mock.calls[0][0].detail).toEqual({label: "element:picture", keepDrawerOpen: false})
  })

  it("adds capture option dropdowns to image, audio, and video insertion buttons", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete

    for(const label of ["Image", "Audio", "Video"]) {
      const button = ribbon.shadowRoot!.querySelector<RibbonButton>(
        `ribbon-drawer[label="Elements"] ribbon-button[label="${label}"]`,
      )!
      await button.updateComplete
      expect(button.shadowRoot!.querySelector("ribbon-menu[custom-content]")).toBeNull()
      expect(button.shadowRoot!.querySelector(".submenu-trigger")).not.toBeNull()
    }

    const website = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="Website"]',
    )!
    await website.updateComplete
    expect(website.shadowRoot!.querySelector("ribbon-menu[custom-content]")).toBeNull()
    expect(website.shadowRoot!.querySelector(".submenu-trigger")).toBeNull()
  })

  it.each([
    ["Image", "screen-image"], ["Audio", "screen-audio"], ["Video", "screen-video"],
  ])("matches the placeholder wording and icons in the %s chevron menu", async (label, mode) => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const image = ribbon.shadowRoot!.querySelector<RibbonButton>(
      `ribbon-drawer[label="Elements"] ribbon-button[label="${label}"]`,
    )!
    await image.updateComplete
    image.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await image.updateComplete
    const menu = image.shadowRoot!.querySelector("ribbon-menu")!
    await (menu as unknown as {updateComplete: Promise<unknown>}).updateComplete
    const options = menu.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    expect(Array.from(options, option => option.textContent?.trim())).toEqual([
      "Select file",
      "Capture screen",
      "Record",
    ])
    expect(Array.from(options, option => option.querySelector("svg")?.classList.toString())).toEqual([
      expect.stringContaining("icon-tabler-folder-open"),
      expect.stringContaining("icon-tabler-screen-share"),
      expect.stringContaining("icon-tabler-player-record"),
    ])
    expect(menu.querySelector("svg")).toBeNull()
    options[1].click()

    expect(listener.mock.calls.at(-1)?.[0].detail).toEqual({label: `media-capture:${mode}`})
  })

  it.each([
    ["Image", "picture", "screen-image", "camera-image"],
    ["Audio", "audio", "screen-audio", "microphone-audio"],
    ["Video", "video", "screen-video", "camera-video"],
  ])("groups source actions under %s in the compact Media menu", async (label, type, screen, record) => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.expanded = false
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const media = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="Media"]',
    )!
    await media.updateComplete
    media.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await media.updateComplete
    const menu = media.shadowRoot!.querySelector("ribbon-menu")!
    await (menu as unknown as {updateComplete: Promise<unknown>}).updateComplete
    const labels = Array.from(menu.shadowRoot!.querySelectorAll<HTMLButtonElement>('.item-row > .item'))
      .map(option => option.textContent?.trim())
    expect(labels).toEqual(["Image", "Audio", "Video", "Graphic", "Website"])
    menu.shadowRoot!.querySelector<HTMLButtonElement>(`.item[title="${label}"]`)!.click()
    expect(listener.mock.calls.at(-1)?.[0].detail).toEqual({label: `element:${type === "picture" ? "picture" : type}`})

    menu.shadowRoot!.querySelector<HTMLButtonElement>(`[aria-label="Show more ${label} options"]`)!.click()
    await (menu as unknown as {updateComplete: Promise<unknown>}).updateComplete
    const options = menu.shadowRoot!.querySelectorAll<HTMLButtonElement>(`[aria-label="${label} options"] .item`)
    expect(Array.from(options, option => option.textContent?.trim())).toEqual([
      "Select file", "Capture screen", "Record",
    ])
    for(const [index, action] of [`media-file:${type}`, `media-capture:${screen}`, `media-capture:${record}`].entries()) {
      options[index].click()
      expect(listener.mock.calls.at(-1)?.[0].detail).toEqual({label: action})
    }
  })

  it.each([
    ["picture", "Image"],
    ["audio", "Audio"],
    ["video", "Video"],
    ["iframe", "Website"],
  ] as const)("renders the selected %s options in a dedicated %s toolbox", async (type, label) => {
    const toolbox = new DomEditorToolbox()
    toolbox.media = {type, attributes: {}}
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('[data-tool="Edit"] .toolbox-tab-label')?.textContent).toBe(label)
    expect(toolbox.shadowRoot!.querySelector(`ribbon-drawer[label="${label}"]`)).not.toBeNull()
    const controls = toolbox.shadowRoot!.querySelector<HTMLElement>(".media-toolbox-controls")!
    expect(getComputedStyle(controls).flexDirection).toBe("column")
    expect(Array.from(controls.querySelectorAll("input, select"))
      .every(control => control.getAttribute("type") === "checkbox" || getComputedStyle(control).width === "100%"))
      .toBe(true)
    expect(toolbox.shadowRoot!.querySelector("ribbon-menu[custom-content]")).toBeNull()
  })

  it("reflects image attributes and dispatches edits directly from its toolbox", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {alt: "A diagram", loading: "lazy"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const attributeListener = vi.fn()
    toolbox.addEventListener("media-attribute-change", attributeListener)
    const alt = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Image: Alternative text"]')!
    expect(alt.value).toBe("A diagram")
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Image: Source URL"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Image: Width"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Image: Height"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Image: Loading"]')?.value).toBe("lazy")
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".media-type-switch"))
      .some(button => button.textContent?.includes("Use <"))).toBe(false)
    alt.value = "A photo"
    alt.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(attributeListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {type: "img", attribute: "alt", value: "A photo"},
    }))
  })

  it("keeps media-only options in the specialized Options tier", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "video", attributes: {controls: "", preload: "metadata", playsinline: ""}}
    document.body.append(toolbox)
    await toolbox.updateComplete

    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Video: Controls"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('select[aria-label="Video: Preload"] option[selected][value="metadata"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Video: Play inline"]')?.checked).toBe(true)
  })

  it("offers figure conversion and caption actions from the media toolbox", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {src: "diagram.png"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const actions = vi.fn()
    toolbox.addEventListener("ribbon-button-click", actions)

    const convert = toolbox.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Convert to figure"]')!
    expect(convert).not.toBeNull()
    await convert.updateComplete
    convert.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(actions).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({label: "media-to-figure"})}))

    toolbox.figure = {hasCaption: false}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Convert to figure"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Add caption above"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Add caption below"]')).not.toBeNull()

    toolbox.figure = {hasCaption: true}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Edit caption"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label^="Add caption"]')).toBeNull()
  })

  it("renders timed-media resources and dispatches guarded row and fallback edits", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {
      type: "video",
      attributes: {controls: ""},
      sources: [
        {index: 0, attributes: {src: "movie.mp4", type: "video/mp4"}},
        {index: 1, attributes: {src: "movie.webm", type: "video/webm"}},
      ],
      tracks: [{index: 2, attributes: {kind: "captions", src: "captions.vtt", srclang: "en"}}],
      fallbackHTML: "<p>Download the movie.</p>",
    }
    document.body.append(toolbox)
    await toolbox.updateComplete
    const listener = vi.fn()
    toolbox.addEventListener("media-resource-action", listener)

    expect(toolbox.shadowRoot!.querySelectorAll('[data-resource="source"]')).toHaveLength(2)
    expect(toolbox.shadowRoot!.querySelectorAll('[data-resource="track"]')).toHaveLength(1)
    const source = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Source: Source URL"]')!
    expect(source.value).toBe("movie.mp4")
    source.value = "movie-hd.mp4"
    source.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "video",
      action: "set-attribute",
      resource: "source",
      index: 0,
      expected: {src: "movie.mp4", type: "video/mp4"},
      attribute: "src",
      value: "movie-hd.mp4",
    }}))

    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Move source 1 down"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({
      action: "move", resource: "source", index: 0, direction: 1,
    })}))
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove track 1"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({
      action: "remove", resource: "track", index: 2,
    })}))

    const fallback = toolbox.shadowRoot!.querySelector<HTMLTextAreaElement>('.media-fallback-input')!
    expect(fallback.value).toBe("<p>Download the movie.</p>")
    fallback.value = "<p>Use the download link.</p>"
    fallback.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "video",
      action: "set-fallback",
      html: "<p>Use the download link.</p>",
      expectedHTML: "<p>Download the movie.</p>",
    }}))

    const addTrack = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".media-resource-add"))
      .find(button => button.textContent === "Add track")!
    addTrack.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "video", action: "add", resource: "track",
    }}))
  })

  it("offers image-map lifecycle, drawing, and hotspot attribute controls", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {src: "plan.png"}, imageMap: null}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const listener = vi.fn()
    toolbox.addEventListener("image-map-action", listener)

    toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".media-resource-editor .media-type-switch")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "img", action: "add-map"}}))

    toolbox.media = {
      type: "img",
      attributes: {src: "plan.png", usemap: "#plan"},
      imageMap: {
        name: "plan",
        shared: false,
        areas: [{
          path: [0],
          attributes: {shape: "rect", coords: "1,2,30,40", href: "old.html", alt: "Library"},
        }],
      },
    }
    await toolbox.updateComplete

    const rectangle = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".image-map-draw"))
      .find(button => button.textContent === "Rectangle")!
    rectangle.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "img", action: "draw", shape: "rect",
    }}))

    const href = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Hotspot: Link URL"]')!
    expect(href.value).toBe("old.html")
    href.value = "library.html"
    href.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "img",
      action: "set-area-attribute",
      path: [0],
      expected: {shape: "rect", coords: "1,2,30,40", href: "old.html", alt: "Library"},
      attribute: "href",
      value: "library.html",
    }}))

    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove hotspot 1"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({
      type: "img", action: "remove-area", path: [0],
    })}))
    const removeMap = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".media-resource-add"))
      .find(button => button.textContent === "Remove map")!
    removeMap.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "img", action: "remove-map"}}))
  })

  it("uses iframe website controls without exposing an element switch", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "embed", attributes: {src: "https://example.test", type: "text/html"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('select[aria-label="Website: Element"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: MIME type"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: Source URL"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: Sandbox"]')).toBeNull()
  })
})
