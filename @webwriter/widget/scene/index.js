import { SceneGroup, SceneImage, SceneNode, ScenePath, SceneShape, SceneSprites, SceneText } from "./elements.js";
import { Scene } from "./svg.js";
import {
  SceneBase
} from "./base.js";
import { SceneCore } from "./core.js";
import { SceneGroup as SceneGroup2, SceneImage as SceneImage2, SceneItem, SceneNode as SceneNode2, ScenePath as ScenePath2, SceneShape as SceneShape2, SceneSprites as SceneSprites2, SceneText as SceneText2 } from "./elements.js";
import { sceneMessages } from "../messages/scene/index.js";
import { webglAvailable } from "./webgl.js";
const sceneElements = {
  "ww-scene": Scene,
  "ww-node": SceneNode,
  "ww-path": ScenePath,
  "ww-shape": SceneShape,
  "ww-text": SceneText,
  "ww-image": SceneImage,
  "ww-group": SceneGroup,
  "ww-sprites": SceneSprites
};
export {
  Scene,
  SceneBase,
  SceneCore,
  SceneGroup2 as SceneGroup,
  SceneImage2 as SceneImage,
  SceneItem,
  SceneNode2 as SceneNode,
  ScenePath2 as ScenePath,
  SceneShape2 as SceneShape,
  SceneSprites2 as SceneSprites,
  SceneText2 as SceneText,
  sceneElements,
  sceneMessages,
  webglAvailable
};
