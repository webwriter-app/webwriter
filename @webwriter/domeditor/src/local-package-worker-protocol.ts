import type {LocalPackageDirectoryHandle} from "./local-package-worker"

/** Side-effect-free protocol shared by the page client and worker entry. */
export const LOCAL_PACKAGE_WORKER_MESSAGE = "local-package-worker"
export const LOCAL_PACKAGE_WORKER_DB = "webwriter-local-package-worker"
export const LOCAL_PACKAGE_WORKER_STORE = "directories"

export type LocalPackageWorkerMessage =
  | {type: "register-local-package", requestId?: string, id: string, handle: LocalPackageDirectoryHandle}
  | {type: "unregister-local-package", requestId?: string, id: string}
  | {type: "clear-local-packages", requestId?: string}

export type LocalPackageWorkerRequest =
  | {type: "register-local-package", id: string, handle: LocalPackageDirectoryHandle}
  | {type: "unregister-local-package", id: string}
  | {type: "clear-local-packages"}
