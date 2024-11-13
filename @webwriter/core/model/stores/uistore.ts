
type Notification = {
   variant?: "primary" | "success" | "neutral" | "warning" | "danger",
   message: string
}

export abstract class PackageError extends Error {}
export class PackageMetadataError extends PackageError {}
export class PackageImportError extends PackageError {}
export class PackageRuntimeError extends PackageError {}

export abstract class ManagementError extends Error {}

export abstract class EditorError extends Error {}

export class UIStore {

   constructor(options: any) {
      Object.assign(this, options)
   }
   
   locale: string = "en"
   
   notifications: Notification[] = []

   stickyToolbox = false

   // showTextPlaceholder: boolean = false

   // showWidgetPreview: boolean = false // TODO: Causes multiple issues

   showUnstable = false

   keymap: Record<string, {shortcut: string}> = {}

   enqueueNotification(notification: Notification) {
      this.notifications = [...this.notifications, notification]
   }

   dequeueNotification() {
      return this.notifications.shift()
   }
}