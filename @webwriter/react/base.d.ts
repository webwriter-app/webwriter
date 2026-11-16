import type {ModuleCore} from "@webwriter/widget/base"
import type {DragCommitDetail, DragPickDetail} from "@webwriter/widget/drag"
import type {PlaybackSnapshot} from "@webwriter/widget/playback"
import type {DataErrorDetail} from "@webwriter/widget/data"
import type {LocalizeErrorDetail} from "@webwriter/widget/localize"
import type {ActivateDetail, BackgroundDetail, ConnectDetail, ConnectingDetail, ContextDetail, DisconnectDetail, MoveDetail, MovingDetail, ReconnectDetail, ResizeDetail, ResizingDetail, SceneErrorDetail, SelectDetail} from "@webwriter/widget/scene"
import type {ViewportFitDetail} from "@webwriter/widget/viewport"
import type {RefObject} from "react"

/** Removes `root` from a core's options: the binding supplies it. */
export type BindingOptions<Options> = Omit<Options, "root">

/** What a hook returns for a core, besides its own fields. */
export type CoreBinding<Core extends ModuleCore<any>> = {
  readonly core: Core
  /** The core's snapshot as of the last render. The same object until the state changes. */
  readonly snapshot: ReturnType<Core["getSnapshot"]>
}

/**
 * Binds any core of `@webwriter/widget` to a component of a widget. The core is
 * created once per host from `create(options, rendered, root)`: pass
 * `{...options, root}` to it, and `rendered` where the core takes it. Function
 * options are called through to those of the latest render. The core is
 * connected after the commit that mounts the component, refreshed after every
 * commit and disconnected on unmount. `changed` says whether a difference
 * between two snapshots shows in a template (default: always).
 */
export function useCore<Core extends ModuleCore<any>, Options extends object = {}>(
  host: HTMLElement,
  create: (options: Options, rendered: () => Promise<void>, root: () => ShadowRoot) => Core,
  options?: Options,
  changed?: (next: ReturnType<Core["getSnapshot"]>, seen: ReturnType<Core["getSnapshot"]>, core: Core) => boolean,
): CoreBinding<Core>

/** `detail` types of the events the modules dispatch, by event name. */
export interface WidgetEventMap {
  "ww-dragcommit": CustomEvent<DragCommitDetail>
  "ww-dragpick": CustomEvent<DragPickDetail>
  "ww-playbackchange": CustomEvent<PlaybackSnapshot>
  "ww-dataerror": CustomEvent<DataErrorDetail>
  "ww-select": CustomEvent<SelectDetail>
  "ww-move": CustomEvent<MoveDetail>
  "ww-resize": CustomEvent<ResizeDetail>
  "ww-connect": CustomEvent<ConnectDetail>
  "ww-moving": CustomEvent<MovingDetail>
  "ww-resizing": CustomEvent<ResizingDetail>
  "ww-connecting": CustomEvent<ConnectingDetail>
  "ww-reconnect": CustomEvent<ReconnectDetail>
  "ww-disconnect": CustomEvent<DisconnectDetail>
  "ww-activate": CustomEvent<ActivateDetail>
  "ww-context": CustomEvent<ContextDetail>
  "ww-background": CustomEvent<BackgroundDetail>
  "ww-ready": CustomEvent<{}>
  "ww-viewportfit": CustomEvent<ViewportFitDetail>
  "ww-sceneerror": CustomEvent<SceneErrorDetail>
  localizationerror: CustomEvent<LocalizeErrorDetail>
  optionschange: Event
}

/**
 * Listens for an event on an element, on a ref's element or on the host's
 * shadow root, for the `ww-*` events a JSX prop cannot bind. The latest
 * `handler` is called; the listener is replaced only when the element or the
 * event changes.
 */
export function useEvent<Type extends keyof WidgetEventMap>(
  target: EventTarget | RefObject<EventTarget | null> | null | undefined,
  type: Type,
  handler: (event: WidgetEventMap[Type]) => void,
  capture?: boolean,
): void
export function useEvent(
  target: EventTarget | RefObject<EventTarget | null> | null | undefined,
  type: string,
  handler: (event: Event) => void,
  capture?: boolean,
): void

/** Makes methods of the host run `handlers` while the component is mounted: the actions the editor's drawer and `Shortcuts` call as `host.name()`. */
export function useActions(host: HTMLElement, handlers: Record<string, (...args: any[]) => unknown> | undefined): void

/** Defines getters on the host while the component is mounted, such as the `options` the editor reads from an instance. A member the instance has is left alone. */
export function useHostMembers(host: HTMLElement, members: Record<string, () => unknown>): void

/** Throws for a host without a widget runtime. */
export function requireRuntime(host: HTMLElement, what: string): void
