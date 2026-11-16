/**
 * True if this browser gives out a WebGL context, which the Pixi renderer
 * needs. A widget asks before it chooses its renderer:
 *
 *     static scopedElements = {...sceneElements, "ww-scene": webglAvailable() ? PixiScene : Scene}
 *
 * The answer is found once, with a canvas that is thrown away. A context can
 * still fail later, for example when a page holds too many: the Pixi renderer
 * then reports `ww-sceneerror` with the code `webgl`.
 */
export declare function webglAvailable(): boolean;
