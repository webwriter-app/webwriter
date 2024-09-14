
type Notification = {
   variant?: "primary" | "success" | "neutral" | "warning" | "danger",
   message: string
}

export class UIStore {

   constructor(options: any) {
      Object.assign(this, options)
   }
   
   locale: string = "en"
   
   notifications: Notification[] = []

   stickyToolbox = false

   // showTextPlaceholder: boolean = false

   // showWidgetPreview: boolean = false // TODO: Causes multiple issues

   keymap: Record<string, {shortcut: string}> = {}

   enqueueNotification(notification: Notification) {
      this.notifications = [...this.notifications, notification]
   }

   dequeueNotification() {
      return this.notifications.shift()
   }
}