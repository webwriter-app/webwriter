import { SceneGroup, SceneImage, SceneNode, ScenePath, SceneShape, SceneSprites, SceneText } from "./elements.js";
import { Scene } from "./svg.js";
export { SceneBase, type ActivateDetail, type BackgroundDetail, type ConnectDetail, type ConnectingDetail, type ContextDetail, type DisconnectDetail, type Drawing, type Frame, type HitDetail, type HitKind, type MoveDetail, type MovingDetail, type PathLabel, type PointerPoint, type PortEnd, type ReconnectDetail, type ResizeDetail, type ResizingDetail, type SceneAction, type SceneErrorDetail, type SceneView, type SelectDetail, type Style, type TextFont, type TextSize, type UndoHost, } from "./base.js";
export { SceneCore, type SceneOptions, type ScenePermissions, type SceneSnapshot } from "./core.js";
export { SceneGroup, SceneImage, SceneItem, SceneNode, ScenePath, SceneShape, SceneSprites, SceneText, type Picture, type SpriteItem, type Waypoint } from "./elements.js";
export type { LabelSide, Marker, MarkerKind, Outline, OutlineKind, Point, Rect, Route } from "./geometry.js";
export type { ImageOptions, SnapshotOptions } from "./snapshot.js";
export { sceneMessages, type SceneMessages } from "../messages/scene/index.js";
export { webglAvailable } from "./webgl.js";
export { Scene };
/**
 * The scene elements under their fixed names, for a widget's scoped registry:
 * `static scopedElements = {...sceneElements}`. `ww-scene` is the SVG renderer;
 * a widget that draws with Pixi replaces it: `{...sceneElements, "ww-scene": PixiScene}`.
 */
export declare const sceneElements: {
    "ww-scene": typeof Scene;
    "ww-node": typeof SceneNode;
    "ww-path": typeof ScenePath;
    "ww-shape": typeof SceneShape;
    "ww-text": typeof SceneText;
    "ww-image": typeof SceneImage;
    "ww-group": typeof SceneGroup;
    "ww-sprites": typeof SceneSprites;
};
