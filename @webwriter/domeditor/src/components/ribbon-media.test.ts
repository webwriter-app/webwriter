// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {ElementStyleEditor} from "./element-style-editor"
import {DomEditorToolbox} from "./toolbox"

beforeEach(() => document.body.replaceChildren())

describe("media ribbon drawer", () => {
  it.each([
    ["unsupported", "This browser cannot play this video. Its format or codec may be unsupported. Try a WebM or MP4 version."],
    ["no-video", "No video track can be played; only audio may be available. The video codec may be unsupported. Try a WebM or MP4 version."],
  ] as const)("shows an accessible video playback warning for %s", async (warning, message) => {
    const toolbox = new DomEditorToolbox()
    toolbox.media = {type: "video", attributes: {src: "movie.mp4"}, videoPlaybackWarning: warning}
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    document.body.append(toolbox)
    await toolbox.updateComplete

    const status = toolbox.shadowRoot!.querySelector<HTMLElement>('[role="status"]')!
    expect(status.classList.contains("video-playback-warning")).toBe(true)
    expect(status.textContent?.trim()).toBe(message)
  })

  it("omits playback warnings for healthy video and other media", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "video", attributes: {src: "movie.mp4"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".video-playback-warning")).toBeNull()

    toolbox.media = {type: "audio", attributes: {src: "sound.ogg"}, videoPlaybackWarning: "unsupported"}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".video-playback-warning")).toBeNull()
  })

  it("removes a playback warning when media state updates", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.media = {type: "video", attributes: {src: "movie.mp4"}, videoPlaybackWarning: "unsupported"}
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".video-playback-warning")).not.toBeNull()

    toolbox.media = {type: "video", attributes: {src: "movie.mp4"}}
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".video-playback-warning")).toBeNull()
  })

  it("warns about source files larger than 50 MiB with a focusable tooltip", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.media = {type: "video", attributes: {src: "movie.mp4"}, sourceSize: 50 * 1024 * 1024 + 1}
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    document.body.append(toolbox)
    await toolbox.updateComplete

    const warning = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".large-source-warning")!
    expect(warning).not.toBeNull()
    expect(warning.getAttribute("aria-describedby")).toBe("large-source-warning-message")
    expect(warning.querySelector('[role="tooltip"]')?.textContent?.trim())
      .toBe("Large source files can lead to performance issues for readers")
    expect(getComputedStyle(warning.querySelector<HTMLElement>(".large-source-warning-bubble")!).position).toBe("absolute")
  })

  it.each([undefined, 50 * 1024 * 1024])("does not warn for source size %s", async sourceSize => {
    const toolbox = new DomEditorToolbox()
    toolbox.media = {type: "video", attributes: {src: "movie.mp4"}, ...(sourceSize === undefined ? {} : {sourceSize})}
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".large-source-warning")).toBeNull()
  })

  it.each(["picture", "img", "video", "audio"] as const)("offers cropping only for visual media: %s", async type => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type, attributes: {}}
    toolbox.elementStyle = {target: {localName: type, namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const editor = toolbox.shadowRoot!.querySelector<ElementStyleEditor>('.specialized-options element-style-editor')
    if(editor) await editor.updateComplete
    expect(editor?.shadowRoot!.querySelectorAll('.crop-edges input').length ?? 0).toBe(type === "audio" ? 0 : 4)
  })

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
    expect(Array.from(controls.querySelectorAll("input, select, style-combobox"))
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
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Image: Source"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Image: Width"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Image: Height"]')).toBeNull()
    const loading = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>("style-combobox"))
      .find(combo => (combo as HTMLElement & {label: string}).label === "Image: Loading") as (HTMLElement & {value: string}) | undefined
    expect(loading).toBeUndefined()
    expect(alt.closest('[slot="more"]')).toBeNull()
    expect(alt.closest(".media-toolbox-controls")).not.toBeNull()
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".media-type-switch"))
      .some(button => button.textContent?.includes("Use <"))).toBe(false)
    alt.value = "A photo"
    alt.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(attributeListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {type: "img", attribute: "alt", value: "A photo"},
    }))
  })

  it.each(["audio", "video"] as const)("shows %s playback options in two primary columns", async type => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type, attributes: {autoplay: "", preload: "metadata", playsinline: ""}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const primary = toolbox.shadowRoot!.querySelector<HTMLElement>(".media-primary-options")!
    expect(getComputedStyle(primary).display).toBe("grid")
    expect(getComputedStyle(primary).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))")
    expect(primary.closest('[slot="more"]')).toBeNull()
    expect(Array.from(primary.querySelectorAll("input")).map(input => input.getAttribute("aria-label")))
      .toEqual([`${type === "audio" ? "Audio" : "Video"}: Autoplay`, `${type === "audio" ? "Audio" : "Video"}: Loop`, `${type === "audio" ? "Audio" : "Video"}: Muted`])
    expect(primary.querySelector<HTMLInputElement>("input")!.checked).toBe(true)
    for(const label of ["Controls", "Preload", "Cross-origin", "Play inline"]) {
      expect(toolbox.shadowRoot!.querySelector(`[aria-label="${type === "audio" ? "Audio" : "Video"}: ${label}"]`)).toBeNull()
    }
    expect(toolbox.shadowRoot!.querySelector(".media-fallback-input")).toBeNull()
    const listener = vi.fn()
    toolbox.addEventListener("media-attribute-change", listener)
    const loop = primary.querySelectorAll<HTMLInputElement>("input")[1]
    loop.checked = true
    loop.dispatchEvent(new Event("change", {bubbles: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {type, attribute: "loop", value: ""}}))
  })

  it("offers a Caption button group below Placement in the media toolbox", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {src: "diagram.png"}}
    toolbox.elementStyle = {target: {localName: "img", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const actions = vi.fn()
    toolbox.addEventListener("layout-action", actions)
    const placement = toolbox.shadowRoot!.querySelector('[aria-label="Placement"]')!
    const caption = toolbox.shadowRoot!.querySelector('[role="group"][aria-label="Caption"]')!
    expect(caption.classList.contains("float-button-group")).toBe(true)
    expect(placement.nextElementSibling?.textContent).toBe("Caption")
    expect(placement.nextElementSibling?.nextElementSibling).toBe(caption)
    const buttons = Array.from(caption.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["No caption", "Caption above, align left", "Caption above, align center", "Caption above, align right", "Caption below, align left", "Caption below, align center", "Caption below, align right"])
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true")
    expect(buttons[0].querySelector("rect")).not.toBeNull()
    expect(buttons[0].querySelector("line")).toBeNull()
    expect(buttons[0].classList.contains("caption-none")).toBe(true)
    for(const [index, button] of buttons.slice(1).entries()) {
      const line = button.querySelector("line")!
      expect(line.namespaceURI).toBe("http://www.w3.org/2000/svg")
      expect(line.getAttribute("x1")).toBe(String(6 + index % 3 * 3))
      expect(line.getAttribute("y1")).toBe(index < 3 ? "3" : "21")
      expect(button.querySelector("rect")!.getAttribute("width")).toBe("12")
    }

    buttons[6].click()
    expect(actions).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "setCaption", position: "below", alignment: "right"}}))
    toolbox.captionPosition = "above"
    toolbox.captionAlignment = "center"
    await toolbox.updateComplete
    expect(buttons[2].getAttribute("aria-pressed")).toBe("true")
    expect(toolbox.shadowRoot!.querySelector('ribbon-button[label="Convert to figure"], ribbon-button[label^="Add caption"]')).toBeNull()
  })

  it("renders only fallback sources and dispatches guarded resource edits", async () => {
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

    expect(toolbox.shadowRoot!.querySelectorAll('[data-resource="source"]')).toHaveLength(1)
    expect(toolbox.shadowRoot!.querySelectorAll('[data-resource="track"]')).toHaveLength(1)
    const source = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Source: Source URL"]')!
    expect(source.value).toBe("movie.webm")
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Video: Source"]')!.value).toBe("movie.mp4")
    source.value = "movie-hd.mp4"
    source.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "video",
      action: "set-attribute",
      resource: "source",
      index: 1,
      expected: {src: "movie.webm", type: "video/webm"},
      attribute: "src",
      value: "movie-hd.mp4",
    }}))

    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Move source 1 up"]')!.disabled).toBe(true)
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove track 1"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({
      action: "remove", resource: "track", index: 2,
    })}))

    expect(toolbox.shadowRoot!.querySelector('.media-fallback-input')).toBeNull()
    const heading = toolbox.shadowRoot!.querySelector('[aria-label="Fallback sources"] .media-resource-heading')!
    expect(heading.firstElementChild?.textContent).toBe("Fallback sources")
    expect(getComputedStyle(heading).justifyContent).toBe("space-between")
    const addTrack = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Add track"]')!
    expect(addTrack.querySelector("svg")).not.toBeNull()
    addTrack.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "video", action: "add", resource: "track",
    }}))
  })

  it("draws hotspots without map lifecycle controls and edits popover behavior", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {src: "plan.png"}, imageMap: null}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const listener = vi.fn()
    toolbox.addEventListener("image-map-action", listener)

    expect(toolbox.shadowRoot!.querySelector('button[aria-label="Add hotspot"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('button[aria-label="Remove map"]')).toBeNull()
    Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".image-map-draw"))
      .find(button => button.textContent === "Rectangle")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "img", action: "draw", shape: "rect"}}))

    toolbox.media = {
      type: "img",
      attributes: {src: "plan.png", usemap: "#plan"},
      imageMap: {
        name: "plan",
        shared: false,
        areas: [{
          path: [0],
          attributes: {shape: "rect", coords: "1,2,30,40", href: "old.html", popovertarget: "info"},
        }],
      },
    }
    await toolbox.updateComplete

    for(const label of ["Alternative text", "Open in", "Link relationship", "Referrer policy"]) {
      expect(toolbox.shadowRoot!.querySelector(`[aria-label="Hotspot: ${label}"]`)).toBeNull()
    }

    const rectangle = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".image-map-draw"))
      .find(button => button.textContent === "Rectangle")!
    rectangle.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "img", action: "draw", shape: "rect",
    }}))

    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Hotspot: Link URL"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('button[aria-label="Open hotspot 1 popover"]')).toBeNull()
    const border = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Hotspot: Border"]')!
    const background = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Hotspot: Background"]')!
    expect(border.checked).toBe(true)
    expect(background.checked).toBe(true)
    border.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "img", action: "set-overlay", path: [0], part: "border",
      expected: {shape: "rect", coords: "1,2,30,40", href: "old.html", popovertarget: "info"}, value: false,
    }}))
    background.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "img", action: "set-overlay", path: [0], part: "background",
      expected: {shape: "rect", coords: "1,2,30,40", href: "old.html", popovertarget: "info"}, value: false,
    }}))

    const trigger = toolbox.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Hotspot: Popover trigger"]')!
    expect(trigger.value).toBe("click")
    trigger.value = "hover"
    trigger.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "img", action: "set-popover-trigger", path: [0],
      expected: {shape: "rect", coords: "1,2,30,40", href: "old.html", popovertarget: "info"}, value: "hover",
    }}))
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove hotspot 1"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({
      type: "img", action: "remove-area", path: [0],
    })}))
    expect(toolbox.shadowRoot!.querySelector("button[aria-label='Remove map']")).toBeNull()
  })

  it("keeps link URLs for link-only hotspots and hides them for hover popovers", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "img", attributes: {src: "plan.png"}, imageMap: {
      name: "plan", shared: false, areas: [
        {path: [0], attributes: {shape: "rect", coords: "0,0,10,10", href: "page.html", class: "ww-hotspot-transparent"}},
        {path: [1], attributes: {shape: "rect", coords: "10,10,20,20", href: "tip.html", interestfor: "tip", class: "ww-hotspot-no-border"}},
        {path: [2], attributes: {shape: "rect", coords: "20,20,30,30", class: "ww-hotspot-no-background"}},
        {path: [3], attributes: {shape: "rect", coords: "30,30,40,40", class: "ww-hotspot-no-border ww-hotspot-no-background"}},
      ],
    }}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const areas = toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".image-map-area")
    expect(areas[0].querySelector('input[aria-label="Hotspot: Link URL"]')).not.toBeNull()
    expect(areas[1].querySelector('input[aria-label="Hotspot: Link URL"]')).toBeNull()
    expect(areas[0].querySelector<HTMLInputElement>('input[aria-label="Hotspot: Border"]')!.checked).toBe(false)
    expect(areas[0].querySelector<HTMLInputElement>('input[aria-label="Hotspot: Background"]')!.checked).toBe(false)
    expect(areas[1].querySelector<HTMLInputElement>('input[aria-label="Hotspot: Border"]')!.checked).toBe(false)
    expect(areas[1].querySelector<HTMLInputElement>('input[aria-label="Hotspot: Background"]')!.checked).toBe(true)
    expect(areas[2].querySelector<HTMLInputElement>('input[aria-label="Hotspot: Border"]')!.checked).toBe(true)
    expect(areas[2].querySelector<HTMLInputElement>('input[aria-label="Hotspot: Background"]')!.checked).toBe(false)
    expect(areas[3].querySelector<HTMLInputElement>('input[aria-label="Hotspot: Border"]')!.checked).toBe(false)
    expect(areas[3].querySelector<HTMLInputElement>('input[aria-label="Hotspot: Background"]')!.checked).toBe(false)
    expect(areas[0].querySelector('button[aria-label="Add hotspot 1 popover"]')).not.toBeNull()
    expect(areas[1].querySelector('button[aria-label="Add hotspot 2 popover"]')).toBeNull()
    expect(areas[1].querySelector('button[aria-label="Open hotspot 2 popover"]')).toBeNull()
  })

  it("edits hotspot coordinates one numeric field at a time for each shape", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type: "img", attributes: {src: "plan.png"}, imageMap: {
      name: "plan", shared: false, areas: [
        {path: [0], attributes: {shape: "rect", coords: "1,2,30,40"}},
        {path: [1], attributes: {shape: "circle", coords: "5,6,7"}},
        {path: [2], attributes: {shape: "poly", coords: "1,2,3,4,odd"}},
      ],
    }}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const listener = vi.fn()
    toolbox.addEventListener("image-map-action", listener)

    for(const label of ["X1", "Y1", "X2", "Y2"]) {
      expect(toolbox.shadowRoot!.querySelector(`input[aria-label="Hotspot: ${label}"]`)).not.toBeNull()
    }
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Hotspot: Coordinates"]')).toBeNull()
    const rectX2 = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Hotspot: X2"]')!
    rectX2.value = "31"
    rectX2.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener.mock.lastCall?.[0].detail).toEqual({
      type: "img", action: "set-area-attribute", path: [0],
      expected: {shape: "rect", coords: "1,2,30,40"}, attribute: "coords", value: "1,2,31,40",
    })
    listener.mockClear()
    rectX2.value = "invalid"
    rectX2.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).not.toHaveBeenCalled()

    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Hotspot: Center X"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Hotspot: Radius"]')).not.toBeNull()
    const radius = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Hotspot: Radius"]')!
    radius.value = "9"
    radius.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener.mock.lastCall?.[0].detail).toEqual({
      type: "img", action: "set-area-attribute", path: [1],
      expected: {shape: "circle", coords: "5,6,7"}, attribute: "coords", value: "5,6,9",
    })

    const polygon = toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".image-map-area")[2]
    expect(polygon.querySelector<HTMLInputElement>('input[aria-label="Hotspot: X3"]')!.value).toBe("odd")
    const poly = polygon.querySelector<HTMLInputElement>('input[aria-label="Hotspot: Y2"]')!
    poly.value = "8"
    poly.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener.mock.lastCall?.[0].detail).toEqual({
      type: "img", action: "set-area-attribute", path: [2],
      expected: {shape: "poly", coords: "1,2,3,4,odd"}, attribute: "coords", value: "1,2,3,8,odd",
    })
  })

  it("adds a popover to an existing hotspot", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type: "img", attributes: {src: "plan.png"}, imageMap: {
      name: "plan", shared: false, areas: [{path: [0], attributes: {shape: "rect", coords: "0,0,10,10"}}],
    }}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const listener = vi.fn()
    toolbox.addEventListener("image-map-action", listener)
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Add hotspot 1 popover"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      type: "img", action: "add-popover", path: [0], expected: {shape: "rect", coords: "0,0,10,10"},
    }}))
  })

  it("uses iframe website controls without exposing an element switch", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.media = {type: "embed", attributes: {src: "https://example.test", type: "text/html"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>("style-combobox"))
      .some(combo => (combo as HTMLElement & {label: string}).label === "Website: Element")).toBe(false)
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: MIME type"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: Source"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: Sandbox"]')).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('input[aria-label="Website: Allow fullscreen"]')!.closest('[slot="more"]')).toBeNull()
  })
})


describe("primary media Source control", () => {
  it("explains unsupported website URLs without dispatching a change and accepts a corrected HTTPS source", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type: "iframe", attributes: {src: "https://example.test/original"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const input = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Website: Source"]')!
    const listener = vi.fn()
    toolbox.addEventListener("media-attribute-change", listener)
    input.value = "http://example.test/blocked"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(input.validationMessage).toContain("https://")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(listener).not.toHaveBeenCalled()
    expect(toolbox.media.attributes.src).toBe("https://example.test/original")
    input.value = "https://example.test/replacement"
    input.dispatchEvent(new Event("input", {bubbles: true}))
    expect(input.validationMessage).toBe("")
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(input.validationMessage).toBe("")
    expect(input.hasAttribute("aria-invalid")).toBe(false)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "iframe", attribute: "src", value: input.value}}))
  })

  it.each(["picture", "img", "audio", "video"] as const)("joins the %s input buttons and URL above Options", async type => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type, attributes: {src: "https://example.com/media"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const source = toolbox.shadowRoot!.querySelector(".media-source")!
    expect(source.closest('[slot="more"]')).toBeNull()
    expect(source.querySelector("label")?.textContent).toBe("Source")
    expect(source.querySelectorAll('.media-source-buttons button')).toHaveLength(3)
    expect(source.querySelector('input')?.value).toBe("https://example.com/media")
    expect(source.querySelector('.media-source-field button[aria-label="Remove source"]')).not.toBeNull()
    const listener = vi.fn()
    toolbox.addEventListener("ribbon-button-click", listener)
    for(const button of source.querySelectorAll<HTMLButtonElement>('button')) button.click()
    expect(listener.mock.calls.map(([event]) => event.detail.label)).toEqual([
      "selected-media-file", `selected-media-capture:screen-${type === "picture" || type === "img" ? "image" : type}`,
      `selected-media-capture:${type === "audio" ? "microphone-audio" : type === "video" ? "camera-video" : "camera-image"}`, "remove-media-source",
    ])
    expect(toolbox.shadowRoot!.querySelector('[slot="more"] input[type="url"][aria-label$=": Source URL"]')).toBeNull()
  })

  it.each([
    ["file", "photo.png", "folder-open"],
    ["capture", "Capture 2", "screen-share"],
    ["recording", "Recording 3", "player-record"],
  ] as const)("shows the active %s label and clear button inside the URL field", async (kind, label, icon) => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type: "img", attributes: {src: "data:image/png;base64,YQ=="}, sourceLabel: label, sourceKind: kind}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const field = toolbox.shadowRoot!.querySelector('.media-source-field')!
    const input = field.querySelector<HTMLInputElement>('input')!
    expect(input.value).toBe(label)
    expect(field.querySelector('svg')?.classList.toString()).toContain(icon)
    expect(field.querySelector('button[aria-label="Remove source"]')).not.toBeNull()
    const listener = vi.fn()
    toolbox.addEventListener("media-attribute-change", listener)
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(listener).not.toHaveBeenCalled()
    input.value = "https://example.com/replacement.png"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "img", attribute: "src", value: input.value}}))
  })

  it("hides the source icon and clear button when empty", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type: "img", attributes: {}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const field = toolbox.shadowRoot!.querySelector('.media-source-field')!
    expect(field.querySelector<HTMLInputElement>('input')?.value).toBe("")
    expect(field.querySelector('svg')).toBeNull()
    expect(field.querySelector('button')).toBeNull()
  })
})


describe("primary media alternative text", () => {
  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)("edits %s alternative text in primary options", async type => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    const attribute = ["img", "picture"].includes(type) ? "alt" : "aria-label"
    toolbox.media = {type, attributes: {[attribute]: "Description"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const input = toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label$=": Alternative text"]')!
    expect(input.value).toBe("Description")
    expect(input.closest('[slot="more"]')).toBeNull()
    expect(input.closest(".media-toolbox-controls")).not.toBeNull()
    const listener = vi.fn()
    toolbox.addEventListener("media-attribute-change", listener)
    input.value = "New description"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {type, attribute, value: "New description"}}))
  })

  it.each(["picture", "img", "video"] as const)("places crop and object controls in advanced options for %s", async type => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {
      type,
      attributes: {src: "media.png"},
      ...(type === "img" || type === "picture" ? {imageMap: {
        name: "map", shared: false,
        areas: [{path: [0], attributes: {shape: "rect", coords: "0,0,10,10"}}],
      }} : {}),
    }
    document.body.append(toolbox)
    await toolbox.updateComplete
    const primary = toolbox.shadowRoot!.querySelector<ElementStyleEditor>('element-style-editor:not([slot="more"])')!
    const advanced = toolbox.shadowRoot!.querySelector<ElementStyleEditor>('.specialized-options element-style-editor')!
    expect(primary.propertyNames).not.toContain("object-view-box")
    expect(primary.propertyNames).not.toContain("object-fit")
    expect(primary.propertyNames).not.toContain("object-position")
    expect(advanced.propertyNames).toEqual(["object-view-box", "object-fit", "object-position"])
    if(type === "img" || type === "picture") {
      expect(toolbox.shadowRoot!.querySelector(".image-map-area")!.compareDocumentPosition(advanced)
        & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it("keeps every child source as fallback when the media has its own src", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type: "audio", attributes: {src: "primary.mp3"}, sources: [{index: 2, attributes: {src: "fallback.ogg"}}]}
    document.body.append(toolbox)
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelectorAll('[data-resource="source"]')).toHaveLength(1)
    expect(toolbox.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Source: Source URL"]')!.value).toBe("fallback.ogg")
  })

  it("offers image inputs for video covers and edits only poster", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type: "video", attributes: {src: "movie.mp4", poster: "cover.png"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const cover = toolbox.shadowRoot!.querySelector('[data-cover="true"]')!
    expect(cover.closest('[slot="more"]')).toBeNull()
    expect(cover.querySelector("label")!.textContent).toBe("Cover image")
    const actions = vi.fn()
    const edits = vi.fn()
    toolbox.addEventListener("ribbon-button-click", actions)
    toolbox.addEventListener("media-attribute-change", edits)
    for(const button of cover.querySelectorAll<HTMLButtonElement>(".media-source-buttons button")) button.click()
    expect(actions.mock.calls.map(([event]) => event.detail.label)).toEqual([
      "selected-media-cover-file", "selected-media-cover-capture:screen-image", "selected-media-cover-capture:camera-image",
    ])
    const input = cover.querySelector<HTMLInputElement>("input")!
    expect(input.value).toBe("cover.png")
    input.value = "new-cover.png"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(edits).toHaveBeenLastCalledWith(expect.objectContaining({detail: {type: "video", attribute: "poster", value: "new-cover.png"}}))
    cover.querySelector<HTMLButtonElement>('button[aria-label="Remove cover image"]')!.click()
    expect(edits).toHaveBeenLastCalledWith(expect.objectContaining({detail: {type: "video", attribute: "poster", value: null}}))
  })
})


describe("media source file drops", () => {
  it.each(["picture", "img", "audio", "video", "iframe", "embed", "object"] as const)("accepts a file on the %s source input", async type => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.media = {type, attributes: {src: "old"}}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const file = new File(["file"], "media.bin")
    const data = new DataTransfer()
    data.items.add(file)
    const input = toolbox.shadowRoot!.querySelector<HTMLInputElement>("#media-source-url")!
    const event = (type: string) => {
      const event = new Event(type, {bubbles: true, cancelable: true})
      Object.defineProperty(event, "dataTransfer", {value: data})
      return event
    }
    const received = vi.fn()
    toolbox.addEventListener("media-file-drop", received)
    const over = event("dragover")
    input.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(data.dropEffect).toBe("copy")
    const drop = event("drop")
    input.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(received).toHaveBeenCalledOnce()
    expect((received.mock.calls[0][0] as CustomEvent).detail).toEqual({type, file, attribute: undefined})
  })
})
