import { marshal, FileAccount } from "#model"

function writeFileDownload(uri: string, name?: string) {
    const a = document.createElement("a");
    name && a.setAttribute("download", name);
    a.style.display = "none";
    a.href = uri;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  
  async function readFileInput() {
    return new Promise<string | Uint8Array | undefined>(
      async (resolve, reject) => {
        let file: File;
        try {
          file = await pickFileInput();
        } catch (err) {
          return reject(new Error("User cancelled"));
        }
        const reader = new FileReader();
        reader.readAsText(file);
        reader.addEventListener("load", () =>
          typeof reader.result === "string"
            ? resolve(reader.result!)
            : resolve(new Uint8Array(reader.result!))
        );
      }
    );
  }
  
  async function pickFileInput() {
    const input = document.createElement("input");
    input.type = "file";
    return new Promise<File>((resolve, reject) => {
      input.addEventListener("change", () => {
        if (input.files && input.files.length && input.files.item(0)) {
          const file = input.files.item(0)!;
          resolve(file);
        }
      });
      input.addEventListener("cancel", reject);
      input.click();
    });
  }
  
  const SAVE_FILTERS = [
    ...Object.entries(marshal)
      .filter(([k, v]) => !v.isParseOnly)
      .map(([k, v]) => ({
        name: "Explorable",
        extensions: v.extensions as unknown as string[],
        types: { [k]: v.extensions.map((ext) => "." + ext) },
      })),
  ];
  const LOAD_FILTERS = [
    {
      name: "Explorable",
      extensions: Object.values(marshal).flatMap((v) => v.extensions),
      types: Object.fromEntries(
        Object.keys(marshal).map((k) => [
          k,
          (marshal as any)[k].extensions.map((ext: string) => "." + ext),
        ])
      ),
    },
    ...Object.entries(marshal).map(([k, v]) => ({
      name: "Explorable",
      extensions: v.extensions as unknown as string[],
      types: { [k]: v.extensions.map((ext) => "." + ext) },
    })),
  ];
  
  type FileFormat = keyof typeof marshal;


// @ts-ignore: Fix account types
export class FileClient implements DocumentClient {
    constructor(
      readonly account: FileAccount
    ) {}
  
    get fileSystemSupported() {
      return "createWritable" in FileSystemFileHandle.prototype;
    }
  
    get showOpenFilePickerSupported() {
      return "showOpenFilePicker" in window;
    }
  
    get showSaveFilePickerSupported() {
      return "showSaveFilePicker" in window;
    }
  
    async saveDocument(
      doc: string | Uint8Array,
      url?: string | URL | FileSystemFileHandle,
      title?: string
    ) {
      if (this.fileSystemSupported && this.showSaveFilePickerSupported) {
        const handle =
          (url as FileSystemFileHandle) ??
          ((await this.pickSave()) as FileSystemFileHandle | undefined);
        const writable = await handle.createWritable();
        await writable.write(doc);
        await writable.close();
        return handle;
      } else {
        const blob = new Blob([doc]);
        const url = URL.createObjectURL(blob);
        writeFileDownload(url, "explorable.html");
        URL.revokeObjectURL(url);
      }
    }
  
    async loadDocument(
      url?: string | FileSystemFileHandle | URL
    ) {
      if (this.showOpenFilePickerSupported) {
        const handle =
          (url as FileSystemFileHandle) ??
          ((await this.pickLoad()) as FileSystemFileHandle | undefined);
        if (!handle) {
          return;
        }
        const file = await handle.getFile();
        const reader = new FileReader();
        reader.readAsText(file);
        return new Promise<string | Uint8Array>((resolve) => {
          reader.addEventListener("load", () =>
            typeof reader.result === "string"
              ? resolve(reader.result!)
              : resolve(new Uint8Array(reader.result!))
          );
        });
      } else if (url) {
        throw Error(
          "Not supported in your browser or permissions for File System Access API are missing (try Chrome or Edge)"
        );
      } else {
        return readFileInput();
      }
    }
  
    async pickSave(
      filters: typeof SAVE_FILTERS = SAVE_FILTERS,
      defaultPath?: string
    ) {
      if (this.showSaveFilePickerSupported) {
        try {
          let handle: FileSystemFileHandle = await (
            window as any
          ).showSaveFilePicker({
            startIn: "documents",
            types: filters.map((filter) => ({
              description: filter.name,
              accept: filter.types,
            })),
          });
          handle = Array.isArray(handle) ? handle[0] : handle;
          return handle;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            return undefined;
          } else {
            throw err;
          }
        }
      } else {
        throw Error(
          "Not supported in your browser or permissions for File System Access API are missing (try Chrome or Edge)"
        );
      }
    }
  
    async pickLoad(filters: typeof LOAD_FILTERS = LOAD_FILTERS) {
      if ("showOpenFilePicker" in window) {
        try {
          let handle: FileSystemFileHandle = await (
            window as any
          ).showOpenFilePicker({
            startIn: "documents",
            types: filters.map((filter) => ({
              description: filter.name,
              accept: filter.types,
            })),
          });
          handle = Array.isArray(handle) ? handle[0] : handle;
          return handle;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") {
            return undefined;
          } else {
            throw err;
          }
        }
      } else {
        throw Error(
          "Not supported in your browser or permissions for File System Access API are missing (try Chrome or Edge)"
        );
      }
    }
  
    isClientURL(url: URL) {
      return url.protocol === "file:";
    }
  }