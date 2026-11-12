# Convert & import/export

A widget can convert HTML content to an interactive element. It can also convert its content to native HTML. The widget can import and export files in the formats it declares.

![A widget exchanges content with a native HTML list and with files](../../images/widgets/conversions.svg)

Use `convertFrom` to specify the formats that the widget can read. Use `convertTo` to specify the formats that it can write. Use tag names for HTML conversions. Use file extensions or [media types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types) for file conversions.

The authoring tool shows available conversions for the selected element. Authors can open the Widget drawer or select the element icon to find them. A dotted underline in the Packages drawer identifies an installed widget that can accept the selected element.

## Convert between a native list and a packing checklist

The packing checklist keeps a native list in its light DOM. The authoring tool passes a detached copy of the selected list to `loadList`. It replaces the selected list with the widget. The `toList` method returns a detached copy of the widget's list. The authoring tool can undo the replacement in one step.

```js
class PackingChecklist extends HTMLElement {
  static convertFrom = {ul: "loadList"}
  static convertTo = {ul: "toList"}

  loadList(fragment) {
    this.replaceChildren(fragment)
  }

  toList() {
    return this.querySelector(":scope > ul")?.cloneNode(true) ?? null
  }
}

customElements.define("ww-packing-checklist", PackingChecklist)
```

Declare `"content": "ul"` in the [editing configuration](../reference/editing-configuration.md) to let authors edit the list in place. To export adjacent elements, return a [`DocumentFragment`](https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment) with elements of the declared tag. A timeline, for example, can return `details` elements.

## Add file formats to the same maps

Replace the two maps with the declarations that follow. Add the methods to the class.

```js
static convertFrom = {ul: "loadList", ".json": "importJson"}
static convertTo = {ul: "toList", "text/plain": "exportText"}

async importJson(file) {
  const values = JSON.parse(await file.text())
  if(!Array.isArray(values) || !values.every(value => typeof value === "string")) {
    throw new Error("Expected a JSON array of strings.")
  }

  const list = this.ownerDocument.createElement("ul")
  for(const value of values) {
    const item = this.ownerDocument.createElement("li")
    item.textContent = value
    list.append(item)
  }
  return () => this.replaceChildren(list)
}

exportText() {
  const items = this.querySelectorAll(":scope > ul > li")
  const text = Array.from(items, item => item.textContent).join("\n")
  return new File([text], "packing-list.txt", {type: "text/plain"})
}
```

A file such as `packing-list.json` can contain `["Water bottle", "Notebook", "Rain jacket"]`. The import method reads the file. It checks the data before it returns a function. The authoring tool runs that function synchronously if the authored content has not changed. The authoring tool can undo the import in one step.

Use a file extension as the key if the filename identifies the format. For example, `".json": "importJson"` permits import when the file has no media type. The authoring tool uses the key to filter the file chooser and identify the file. Check the file contents in the import handler.

For an export, use the declared extension in the filename or set the declared media type. The authoring tool downloads the file.

Declare `"importFormats": [".json"]` and `"exportFormats": ["text/plain"]` in the widget's editing configuration. The configuration lists the file formats. The runtime methods do the conversions. See the [editing configuration reference](../reference/editing-configuration.md#advertise-file-formats).

The [runtime reference](../reference/runtime.md#conversions) lists return values and gives the order of precedence for instance and class declarations.

## Supported conversion types

## Validation of imported files
