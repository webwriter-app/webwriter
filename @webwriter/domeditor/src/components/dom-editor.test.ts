// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import type {DomEditorBreadcrumb, DocumentTreeItem} from "./breadcrumb"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenu} from "./ribbon-menu"
import {
  executeCompleteEvent,
  executeFailureEvent,
  initializeEditorMessage,
  loadWidgetsMessage,
  markStateChangeEvent,
  presenceChangeEvent,
  selectionChangeEvent,
} from "../editor-bridge"
import {INSTALLED_PACKAGES_STORAGE_KEY, WebWriterPackageRegistry, type WebWriterPackage} from "../packages"

const demoPackage: WebWriterPackage = {
  name: "@webwriter/demo",
  version: "1.0.0",
  label: "Demo",
  description: "Demo package",
  iconUrl: "https://example.com/demo.svg",
  authors: ["Ada"],
  license: "MIT",
  keywords: ["webwriter-widget"],
  links: {},
  scripts: ["https://cdn.jsdelivr.net/npm/@webwriter/demo@1.0.0/dist/demo.js"],
  styles: ["https://cdn.jsdelivr.net/npm/@webwriter/demo@1.0.0/dist/demo.css"],
  members: [{
    id: "@webwriter/demo@1.0.0:./widgets/webwriter-demo",
    packageName: "@webwriter/demo",
    packageVersion: "1.0.0",
    exportName: "./widgets/webwriter-demo.*",
    kind: "widget",
    label: "Demo Widget",
    insertable: true,
    iconUrl: "https://example.com/demo.svg",
    tagName: "webwriter-demo",
  }, {
    id: "@webwriter/demo@1.0.0:./snippets/demo",
    packageName: "@webwriter/demo",
    packageVersion: "1.0.0",
    exportName: "./snippets/demo.html",
    kind: "snippet",
    label: "Demo Snippet",
    insertable: true,
    htmlUrl: "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.0.0/dist/demo.html",
  }],
}

async function mountEditor() {
  const editor = new DomEditor()
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  iframe.dispatchEvent(new Event("load"))
  return {editor, iframe, editorWindow: iframe.contentWindow!}
}

afterEach(() => {
  document.body.replaceChildren()
  localStorage.removeItem(INSTALLED_PACKAGES_STORAGE_KEY)
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
})

describe("DomEditor iframe setup", () => {
  it("restores installed packages and starts the package catalog fetch on mount", async () => {
    localStorage.setItem(INSTALLED_PACKAGES_STORAGE_KEY, JSON.stringify([demoPackage]))
    const search = vi.mocked(WebWriterPackageRegistry.prototype.search)
    const editor = new DomEditor()
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector("iframe")!
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage")
    iframe.dispatchEvent(new Event("load"))

    expect(search).toHaveBeenCalledTimes(1)
    expect((editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages).toEqual([demoPackage])

    expect(postMessage).toHaveBeenCalledWith({
      type: loadWidgetsMessage,
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
    }, "*")
  })

  it("does not sandbox the editor iframe", async () => {
    const {iframe} = await mountEditor()

    expect(iframe.hasAttribute("sandbox")).toBe(false)
  })

  it("passes the sync URL to the editor through the bridge", async () => {
    const originalUrl = location.href
    history.replaceState({}, "", "/?session=collab-demo&source=local")

    try {
      const editor = new DomEditor()
      document.body.append(editor)
      await editor.updateComplete
      const iframe = editor.shadowRoot!.querySelector("iframe")!
      const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage")

      iframe.dispatchEvent(new Event("load"))

      expect(postMessage).toHaveBeenCalledWith({
        type: initializeEditorMessage,
        syncUrl: "ws://localhost:1234/?session=collab-demo&source=local",
      }, "*")
      expect(iframe.getAttribute("srcdoc")).not.toContain("SYNC_URL")
    }
    finally {
      history.replaceState({}, "", originalUrl)
    }
  })

  it("loads the scoped custom element registry polyfill before widgets", async () => {
    const editor = new DomEditor()
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [demoPackage]
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector("iframe")!
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage")
    const srcdoc = (editor as unknown as {readonly editorSrcdoc: string}).editorSrcdoc

    iframe.dispatchEvent(new Event("load"))

    expect(postMessage).toHaveBeenCalledWith({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/demo", version: "1.0.0"}],
    }, "*")
    const polyfillUrl = "https://cdn.jsdelivr.net/npm/@webcomponents/scoped-custom-element-registry@0.0.10/scoped-custom-element-registry.min.js"
    expect(srcdoc).toContain(`<script src="${polyfillUrl}"></script>`)
    expect(srcdoc.indexOf(polyfillUrl)).toBeLessThan(srcdoc.indexOf("editor-entry"))
    expect(srcdoc).not.toContain("Demo Widget")
  })

  it("persists package additions and removals", async () => {
    const {editor} = await mountEditor()
    vi.spyOn(editor, "execute").mockResolvedValue({update: []})
    vi.spyOn((editor as any).packageRegistry, "getPackage").mockResolvedValue(demoPackage)

    const adding = (editor as any).setPackageInstalled(demoPackage, true) as Promise<unknown>
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe")?.getAttribute("srcdoc")).toContain("<!-- frame 1 -->"))
    editor.shadowRoot!.querySelector("iframe")!.dispatchEvent(new Event("load"))
    await adding

    expect(JSON.parse(localStorage.getItem(INSTALLED_PACKAGES_STORAGE_KEY)!)).toEqual([demoPackage])

    const removing = (editor as any).setPackageInstalled(demoPackage, false) as Promise<unknown>
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe")?.getAttribute("srcdoc")).toContain("<!-- frame 2 -->"))
    editor.shadowRoot!.querySelector("iframe")!.dispatchEvent(new Event("load"))
    await removing

    expect(JSON.parse(localStorage.getItem(INSTALLED_PACKAGES_STORAGE_KEY)!)).toEqual([])
  })
})

describe("DomEditor.execute()", () => {
  it("posts an action and resolves with the completion result", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const postMessage = vi.spyOn(editorWindow, "postMessage").mockImplementation((message: any) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: executeCompleteEvent,
          detail: {requestId: message.requestId, result: "done"},
        },
        source: editorWindow,
      }))
    })
    const completed = vi.fn()
    editor.addEventListener(executeCompleteEvent, completed)

    await expect(editor.execute({type: "lift"})).resolves.toBe("done")
    expect(postMessage).toHaveBeenCalledWith({type: "lift", requestId: "1"}, "*")
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({detail: {requestId: "1", result: "done"}}))
    expect(editor.shadowRoot?.contains(iframe)).toBe(true)
  })

  it("rejects with the error returned by the inner editor", async () => {
    const {editor, editorWindow} = await mountEditor()
    vi.spyOn(editorWindow, "postMessage").mockImplementation((message: any) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: executeFailureEvent,
          detail: {
            requestId: message.requestId,
            error: {name: "NotAllowedError", message: "Clipboard access denied"},
          },
        },
        source: editorWindow,
      }))
    })

    await expect(editor.execute({type: "copy"})).rejects.toMatchObject({
      name: "NotAllowedError",
      message: "Clipboard access denied",
    })
  })

  it("executes the matching insert action from the expanded Insert ribbon", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<p></p>"})
  })

  it("renders Packages as ribbon buttons with a prefixed search bar", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const search = drawer.querySelector("package-search")!
    const button = drawer.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    await Promise.all([search.updateComplete, button.updateComplete])

    expect(drawer).not.toBeNull()
    expect(search.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Search packages"]')).not.toBeNull()
    expect(search.shadowRoot!.querySelector(".icon-tabler-search")).not.toBeNull()
    expect(button.shadowRoot!.querySelector('button[aria-label="Show more Demo options"]')).toBeNull()
  })

  it("installs an uninstalled package and then inserts its first member", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const install = vi.spyOn(editor as any, "setPackageInstalled").mockResolvedValue(demoPackage)
    const insert = vi.spyOn(editor as any, "insertPackageMember").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    await vi.waitFor(() => expect(insert).toHaveBeenCalled())
    expect(install).toHaveBeenCalledWith(demoPackage, true)
    expect(insert).toHaveBeenCalledWith(demoPackage.members[0])
  })

  it("only installs or removes packages while package search is active", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const install = vi.spyOn(editor as any, "setPackageInstalled").mockResolvedValue(demoPackage)
    const insert = vi.spyOn(editor as any, "insertPackageMember").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!.shadowRoot!.querySelector("button")!.click()
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const search = drawer.querySelector("package-search")!
    await search.updateComplete
    const input = search.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.value = "demo"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    const button = drawer.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    await vi.waitFor(() => expect(install).toHaveBeenCalled())
    expect(install).toHaveBeenCalledWith(demoPackage, true)
    expect(insert).not.toHaveBeenCalled()
    expect(button.shadowRoot!.querySelector(".corner-icon")).toBeNull()
  })

  it("removes an installed package from a management-mode package action", async () => {
    const {editor} = await mountEditor()
    Object.defineProperty(editor, "installedPackages", {
      value: [demoPackage],
      writable: true,
      configurable: true,
    })
    const setInstalled = vi.spyOn(editor as any, "setPackageInstalled").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "package-toggle:@webwriter/demo", keepDrawerOpen: true},
      bubbles: true,
      composed: true,
    }))

    expect(setInstalled).toHaveBeenCalledWith(demoPackage, false)
  })

  it("executes undo and redo from the top ribbon controls", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const historyButtons = Array.from(ribbon.shadowRoot!.querySelectorAll<HTMLButtonElement>(".history-button"))

    expect(historyButtons.map(button => button.getAttribute("aria-label"))).toEqual([
      "Undo",
      "Redo",
    ])
    expect(historyButtons[0].querySelector(".icon-tabler-arrow-back-up")).not.toBeNull()
    expect(historyButtons[1].querySelector(".icon-tabler-arrow-forward-up")).not.toBeNull()
    expect(historyButtons[1].nextElementSibling?.getAttribute("aria-label")).toBe("Preview")

    historyButtons[0].click()
    historyButtons[1].click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "undo"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "redo"})
  })

  it("routes media ribbon commands through the iframe bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!

    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "Image"},
      bubbles: true,
      composed: true,
    }))

    expect(execute).toHaveBeenCalledWith({type: "insertMedia", media: "picture"})
    await Promise.resolve()
    focusEditor.mockClear()

    ribbon.dispatchEvent(new CustomEvent("media-type-change", {
      detail: {type: "object"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "switchWebsiteType", website: "object"})

    ribbon.dispatchEvent(new CustomEvent("media-attribute-change", {
      detail: {type: "object", attribute: "data", value: "https://example.test"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({
      type: "setMediaAttribute",
      name: "data",
      value: "https://example.test",
    })
    await Promise.resolve()
    expect(focusEditor).not.toHaveBeenCalled()
  })

  it("renders presence circles before undo and overlaps up to three collaborators", async () => {
    const {editor, editorWindow} = await mountEditor()

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: presenceChangeEvent,
        detail: {
          users: [
            {clientId: 1, name: "Ada Lovelace", initials: "AL", color: "#e11d48"},
            {clientId: 2, name: "Grace Hopper", initials: "GH", color: "#2563eb"},
            {clientId: 3, name: "Lin", initials: "LI", color: "#059669"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await ribbon.updateComplete
    const users = ribbon.shadowRoot!.querySelector<HTMLElement>(".presence-users")!
    const circles = Array.from(users.querySelectorAll<HTMLElement>(".presence-user"))

    expect(circles).toHaveLength(3)
    expect(circles.map(circle => circle.textContent)).toEqual(["AL", "GH", "LI"])
    expect(circles.map(circle => circle.style.getPropertyValue("--presence-color"))).toEqual([
      "#e11d48",
      "#2563eb",
      "#059669",
    ])
    expect(users.querySelector(".presence-more")).toBeNull()
    expect(users.nextElementSibling?.getAttribute("aria-label")).toBe("Undo")
  })

  it("adds a smaller Tabler plus circle with the connected peer count", async () => {
    const {editor, editorWindow} = await mountEditor()

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: presenceChangeEvent,
        detail: {
          users: [1, 2, 3, 4].map(clientId => ({
            clientId,
            name: `User ${clientId}`,
            initials: `U${clientId}`,
            color: "#2563eb",
          })),
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await ribbon.updateComplete
    const users = ribbon.shadowRoot!.querySelector<HTMLElement>(".presence-users")!
    const more = users.querySelector<HTMLElement>(".presence-more")!

    expect(users.querySelectorAll(".presence-user")).toHaveLength(3)
    expect(more.querySelector(".icon-tabler-plus")).not.toBeNull()
    expect(more.querySelector(".presence-more-count")?.textContent).toBe("4")
    expect(more.getAttribute("aria-label")).toBe("+ 4 peers connected")
    expect(users.dataset.userCount).toBe("4")
  })

  it("renders the preview control after redo with the filled play icon", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const previewButton = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!

    expect(previewButton.getAttribute("aria-label")).toBe("Preview")
    expect(previewButton.previousElementSibling?.getAttribute("aria-label")).toBe("Redo")
    expect(previewButton.nextElementSibling?.getAttribute("aria-label")).toBe("Collapse ribbon")
    expect(previewButton.querySelector(".preview-icon")).not.toBeNull()
    expect(previewButton.querySelector(".icon-tabler-player-play.icons-tabler-filled")).not.toBeNull()
  })

  it("renders the current selection path received from the editor bridge", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><span></span><p></p></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
            {path: [0, 1], name: "Paragraph", icon: "Paragraph"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const buttons = Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item"))

    expect(buttons.map(button => button.textContent?.trim())).toEqual([
      "Document",
      "Section",
      "Paragraph",
    ])
    expect(breadcrumb.shadowRoot!.querySelectorAll(".separator")).toHaveLength(2)
    expect(breadcrumb.shadowRoot!.querySelectorAll(".separator-icon svg")).toHaveLength(2)
    expect(buttons[0].parentElement?.nextElementSibling?.classList.contains("tree-toggle-separator")).toBe(true)
    expect(buttons[2].parentElement?.nextElementSibling).toBeNull()
    expect(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item-icon svg")).toHaveLength(3)
  })

  it("renders package widget names and icons in breadcrumbs and the document tree", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [demoPackage]
    iframe.contentDocument!.body.innerHTML = "<webwriter-demo></webwriter-demo>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {
              path: [0],
              name: "Demo Widget",
              icon: "Packages",
              iconUrl: "https://example.com/demo.svg",
            },
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const widget = Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item"))[1]
    expect(widget.textContent?.trim()).toBe("Demo Widget")
    expect(widget.querySelector('img[src="https://example.com/demo.svg"]')).not.toBeNull()

    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children[0]).toEqual(expect.objectContaining({
      name: "Demo Widget",
      icon: "Packages",
      iconUrl: "https://example.com/demo.svg",
    }))
  })

  it("opens an expandable document tree from the Document separator", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p>hello</p><section></section></div>"
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(breadcrumb.shadowRoot!.querySelector("nav")?.classList.contains("tree-nav")).toBe(true)
    expect(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item")).toHaveLength(1)
    expect(breadcrumb.shadowRoot!.querySelector(".breadcrumb-list .item")?.textContent?.trim()).toBe("Document")
    expect(breadcrumb.shadowRoot!.querySelector(".breadcrumb-list .tree-toggle-separator")?.previousElementSibling?.textContent?.trim()).toBe("Document")
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Section",
    ])

    breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-expander")[0].click()
    await breadcrumb.updateComplete

    const treeItems = Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-item"))
    expect(treeItems.map(item => item.textContent?.trim())).toEqual([
      "Section",
      "Paragraph",
      "Section",
    ])
    const paragraph = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0,0"]')!
    expect(paragraph.closest(".tree-row")?.getAttribute("style")).toContain("--tree-depth: 1")
    paragraph.click()

    expect(execute).toHaveBeenCalledWith({type: "selectNode", path: [0, 0]})
  })

  it("omits mark wrappers from the document tree while retaining real descendants", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<p><b>bold</b><span><img></span></p>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-expander")!.click()
    await breadcrumb.updateComplete

    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Paragraph",
      "Image",
    ])
    expect(breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0,1,0"]')).not.toBeNull()
  })

  it("hides picture implementation images and media sources from the document tree", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = `
      <picture><source srcset="small.png"><img src="large.png"></picture>
      <video><source src="movie.mp4"></video>
    `

    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children.map(child => child.name)).toEqual(["Image", "Video"])
    expect(tree.children[0].children).toEqual([])
    expect(tree.children[1].children).toEqual([])
  })

  it("opens the subtree represented by another breadcrumb separator", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><p></p><aside></aside></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
            {path: [0, 1], name: "Sidebar", icon: "Layout"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const separators = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")
    expect(separators).toHaveLength(2)

    separators[1].click()
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item")).map(item => item.textContent?.trim())).toEqual([
      "Document",
      "Section",
    ])
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Paragraph",
      "Sidebar",
    ])
    expect(breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.tree-item[data-path="0,0"]')?.closest(".tree-row")?.getAttribute("style")).toContain("--tree-depth: 0")
  })

  it("shows a gap selection between tree items without adding a row", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><p></p><aside></aside></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
          ],
          gap: {parentPath: [0], offset: 1},
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete

    const marker = breadcrumb.shadowRoot!.querySelector<HTMLElement>(".tree-gap-indicator")!
    expect(marker.classList.contains("tree-gap-indicator-before")).toBe(true)
    expect(marker.closest(".tree-node")?.querySelector<HTMLButtonElement>('.tree-item[data-path="0,1"]')).not.toBeNull()
    expect(breadcrumb.shadowRoot!.querySelectorAll(".tree-node")).toHaveLength(3)
    expect(breadcrumb.shadowRoot!.querySelectorAll(".tree-gap-indicator")).toHaveLength(1)
  })

  it("moves the open subtree to a higher selected element", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><div><article><p></p></article></div><span></span></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
            {path: [0, 0], name: "Section", icon: "Section"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")[2].click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {path: [0], name: "Section", icon: "Section"},
            {path: [0, 0], name: "Section", icon: "Section"},
            {path: [0, 0, 0], name: "Article", icon: "Article"},
            {path: [0, 0, 0, 0], name: "Paragraph", icon: "Paragraph"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item")).map(item => item.textContent?.trim())).toEqual([
      "Document",
      "Section",
      "Section",
    ])
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".tree-item")).map(item => item.textContent?.trim())).toEqual([
      "Article",
      "Paragraph",
    ])
  })

  it("keeps the open tree on editor pointer interaction", async () => {
    const {editor, iframe} = await mountEditor()
    const focus = vi.spyOn(iframe, "focus")
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)

    iframe.contentDocument!.dispatchEvent(new Event("pointerdown", {bubbles: true}))
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(true)
    expect(focus).toHaveBeenCalledWith({preventScroll: true})
  })

  it("prevents breadcrumb pointer interactions from focusing its controls", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete

    const expectPointerDownToBePrevented = (button: HTMLButtonElement) => {
      const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})
      expect(button.dispatchEvent(event)).toBe(false)
      expect(event.defaultPrevented).toBe(true)
    }

    Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"))
      .forEach(expectPointerDownToBePrevented)

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await breadcrumb.updateComplete

    Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"))
      .forEach(expectPointerDownToBePrevented)
  })

  it("selects the node represented by a clicked breadcrumb item", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {path: [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}]},
      },
      source: editorWindow,
    }))
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item")[1].click()

    expect(execute).toHaveBeenCalledWith({type: "selectNode", path: [0]})
  })

  it("starts and ends an element hover from a breadcrumb item", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const item = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>("button.item")!

    item.dispatchEvent(new MouseEvent("mouseenter"))
    item.dispatchEvent(new MouseEvent("mouseleave"))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "hoverNode", path: []})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "hoverNode", path: null})
  })

  it("hides the breadcrumb when the ribbon is collapsed", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const breadcrumb = editor.shadowRoot!.querySelector("dom-editor-breadcrumb")!

    expect(getComputedStyle(breadcrumb).display).not.toBe("none")
    expect(getComputedStyle(breadcrumb).height).toBe("30px")
    ribbon.expanded = false
    await ribbon.updateComplete

    expect(getComputedStyle(breadcrumb).display).toBe("none")
  })

  it("collapses the breadcrumb tree when the ribbon is collapsed", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".tree-toggle-separator .separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(false)
  })

  it("prevents pointer interactions from focusing ribbon controls", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const tab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!
    const button = tab.shadowRoot!.querySelector("button")!
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})

    expect(button.dispatchEvent(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  it("keeps the fixed mark area mounted while selecting text", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const frameDocument = iframe.contentDocument!
    frameDocument.body.innerHTML = "<p>hello</p><p>world</p>"
    const firstParagraph = frameDocument.querySelectorAll("p")[0]
    const secondParagraph = frameDocument.querySelectorAll("p")[1]
    const text = firstParagraph.firstChild!
    const selection = frameDocument.getSelection()!
    selection.setBaseAndExtent(text, 0, text, 3)

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: markStateChangeEvent,
        detail: {canMark: true, marks: []},
      },
      source: editorWindow,
    }))
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document"},
            {path: [0], name: "Paragraph"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete
    expect(drawer.shadowRoot!.querySelector(".drawer-toggle")).toBeNull()
    expect(drawer.hasAttribute("drawer-open")).toBe(false)

    firstParagraph.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, button: 0}))
    expect(drawer.hasAttribute("drawer-open")).toBe(false)

    selection.setBaseAndExtent(secondParagraph.firstChild!, 0, secondParagraph.firstChild!, 3)
    secondParagraph.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, button: 0}))
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(false)
  })

  it("allows ribbon inputs to receive pointer focus", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const root = ribbon.shadowRoot!.querySelector(".ribbon")!
    const input = document.createElement("input")
    root.append(input)
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})

    expect(input.dispatchEvent(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it("restores the editor selection after a ribbon input loses focus", async () => {
    const {editor, iframe} = await mountEditor()
    const frameDocument = iframe.contentDocument!
    frameDocument.body.innerHTML = "<p>hello</p>"
    const text = frameDocument.querySelector("p")!.firstChild!
    const selection = frameDocument.getSelection()!
    selection.setBaseAndExtent(text, 1, text, 4)
    iframe.focus()
    iframe.dispatchEvent(new Event("blur"))

    const focus = vi.spyOn(iframe, "focus")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const root = ribbon.shadowRoot!.querySelector(".ribbon")!
    const input = document.createElement("input")
    root.append(input)

    input.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0}))
    input.dispatchEvent(new FocusEvent("focusin", {bubbles: true, composed: true}))
    input.dispatchEvent(new FocusEvent("focusout", {bubbles: true, composed: true, relatedTarget: null}))
    await Promise.resolve()

    expect(focus).toHaveBeenCalledWith({preventScroll: true})
    expect(selection.anchorNode).toBe(text)
    expect(selection.anchorOffset).toBe(1)
    expect(selection.focusNode).toBe(text)
    expect(selection.focusOffset).toBe(4)
  })

  it("restores iframe focus after a ribbon command", async () => {
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focus = vi.spyOn(iframe, "focus")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()
    await execute.mock.results[0].value

    expect(focus).toHaveBeenCalledWith({preventScroll: true})
  })

  it("uses one Heading ribbon button with a submenu for the other heading levels", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Heading"]')!
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Text"] ribbon-button[label="Heading 2"]')).toBeNull()
    await heading.updateComplete

    heading.shadowRoot!.querySelector('button[title="Heading"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<h1></h1>"})

    heading.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete
    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    await submenu.updateComplete
    submenu.shadowRoot!.querySelector('button[title="Heading 3"]')!.click()

    expect(execute).toHaveBeenLastCalledWith({type: "insert", html: "<h3></h3>"})
  })

  it("puts Preformatted Text in the Paragraph submenu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Show more Paragraph options"]')!.click()
    await paragraph.updateComplete
    const submenu = paragraph.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    submenu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Preformatted Text"]')!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<pre></pre>"})
  })

  it("closes expanded ribbon-button menus when the editor receives focus", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Text"] ribbon-button[label="Heading"]')!
    await heading.updateComplete
    heading.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete

    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    expect(submenu.hidden).toBe(false)
    iframe.contentDocument!.dispatchEvent(new Event("focusin", {bubbles: true}))
    await heading.updateComplete

    expect(submenu.hidden).toBe(true)
  })

  it("executes the matching insert action from the collapsed Insert menu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    const paragraph = menu.shadowRoot!.querySelector('button[title="Paragraph"]')!
    paragraph.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<p></p>"})
  })

  it("renders heading levels 2 to 6 as a submenu in the collapsed Insert menu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete

    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).toBeNull()
    menu.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await menu.updateComplete
    menu.shadowRoot!.querySelector('button[title="Heading 2"]')!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<h2></h2>"})
  })

  it("closes Insert submenus when the collapsed ribbon menu closes", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).not.toBeNull()

    ribbon.menuOpen = false
    await ribbon.updateComplete
    ribbon.menuOpen = true
    await ribbon.updateComplete
    await menu.updateComplete

    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).toBeNull()
  })
})
