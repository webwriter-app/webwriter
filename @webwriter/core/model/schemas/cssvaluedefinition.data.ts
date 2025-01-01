import rawProperties from "mdn-data/css/properties.json"
import rawSyntaxes from "mdn-data/css/syntaxes.json"
import { filterObject } from "../utility"

type KeysMatching<T extends object, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never
}[keyof T];

export const CSSPropertySpecs = { // TODO: Incorrectly typed until TS supports "import .json as const"
  ...filterObject(rawProperties, (k, v) => (["standard"].includes(v.status) || k === "font-smooth") && !["font-palette"].includes(k)),
  "animation-name": {
    ...rawProperties["animation-name"],
    forbiddenIdents: ["unset", "initial", "inherit", "none"]
  },
  "counter-reset": {
    ...rawProperties["counter-reset"],
    forbiddenIdents: ["unset", "initial", "inherit", "none"]
  },
  "counter-increment": {
    ...rawProperties["counter-increment"],
    forbiddenIdents: ["unset", "initial", "inherit", "none"]
  },
  "list-style-type": {
    ...rawProperties["list-style-type"],
    forbiddenIdents: ["unset", "initial", "inherit", "none", "inline", "outside", "disc", "circle", "square", "decimal", "cjk-decimal", "decimal-leading-zero", "lower-roman", "upper-roman", "lower-greek", "lower-alpha", "lower-latin", "upper-alpha", "upper-latin", "arabic-indic", "armenian", "bengali", "cambodian", "cjk-earthly-branch", "cjk-heavenly-stem", "cjk-ideographic", "devanagari", "ethiopic-numeric", "georgian", "gujarati", "gurmukhi", "hebrew", "hiragana", "hiragana-iroha", "japanese-formal", "japanese-informal", "kannada", "katakana", "katakana-iroha", "khmer", "korean-hangul-formal", "korean-hanja-formal", "korean-hanja-informal", "lao", "lower-armenian", "malayalam", "mongolian", "myanmar", "oriya", "persian", "simp-chinese-formal", "simp-chinese-informal", "tamil", "telugu", "thai", "tibetan", "trad-chinese-formal", "trad-chinese-informal", "upper-armenian", "disclosure-open", "disclosure-closed"],
  },
  "grid-row-start": {
    ...rawProperties["grid-row-start"],
    forbiddenIdents: ["span"]
  },
  "grid-row-end": {
    ...rawProperties["grid-row-end"],
    forbiddenIdents: ["span"]
  },
  "grid-column-start": {
    ...rawProperties["grid-column-start"],
    forbiddenIdents: ["span"]
  },
  "grid-column-end": {
    ...rawProperties["grid-column-end"],
    forbiddenIdents: ["span"]
  },
  "view-transition-name": {
    ...rawProperties["view-transition-name"],
    forbiddenIdents: ["unset", "initial", "inherit", "none"]
  },
  "will-change": {
    ...rawProperties["will-change"],
    forbiddenIdents: ["unset", "initial", "inherit", "will-change", "auto", "scroll-position", "contents"]
  },
  "offset-path": {
    ...rawProperties["offset-path"],
    syntax: "none | <url> | <basic-shape> || <coord-box>" // | ray
  }
} as unknown as Omit<typeof rawProperties, `-${string}`>

// Sequencing hotfix
const syntaxesSequence = ["length-percentage", "visual-box", "box", "line-names", "name-repeat", "masking-mode", "mask-source", "target", "cubic-bezier-timing-function", "step-timing-function", "single-animation-iteration-count", "single-animation-direction", "single-animation-fill-mode", "single-animation-play-state", "bg-position", "transition-behavior-value", "single-animation-timeline", "single-transition-property", "easing-function", "shape-box", "quote", "display-outside", "counter-style-name", "mask-reference", "paint-box"]
export type CSSSyntaxes = typeof rawSyntaxes
export const CSSSyntaxes = {
  ...Object.fromEntries(syntaxesSequence.map(k => [k, (rawSyntaxes as any)[k]])),
  ...filterObject(rawSyntaxes, k => !syntaxesSequence.includes(k) && !(k === "offset-path")),
  "keyframe-block": {
    ...rawSyntaxes["keyframe-block"],
    syntax: "<keyframe-selector># '{' <declaration-list> '}'"
  }
}

export type CSSPropertySpecs = typeof CSSPropertySpecs

export type CSSPropertySpec = {
  syntax: string
  media: Media | PropertyList 
  inherited: boolean
  animationType: AnimationType | PropertyList
  percentages: Percentages | PropertyList
  groups: GroupList
  initial: string | PropertyList
  appliesto: AppliesTo
  computed: Computed
  order: Order
  status: Status
  mdnUrl?: MdnURL
  stacking?: boolean
  alsoAppliesTo?: AlsoApplyTo,
  forbiddenIdents?: string[]
}

type PropertyList = (keyof typeof rawProperties)[]

type GroupList = 
  (
  | "Basic Selectors"
  | "Combinators"
  | "Compositing and Blending"
  | "CSS Angles"
  | "CSS Animations"
  | "CSS Backgrounds and Borders"
  | "CSS Basic User Interface"
  | "CSS Box Model"
  | "CSS Box Alignment"
  | "CSS Break"
  | "CSS Cascading and Inheritance"
  | "CSS Charsets"
  | "CSS Color"
  | "CSS Columns"
  | "CSS Conditional Rules"
  | "CSS Containment"
  | "CSS Counter Styles"
  | "CSS Device Adaptation"
  | "CSS Display"
  | "CSS Flexible Box Layout"
  | "CSS Flexible Lengths"
  | "CSS Fonts"
  | "CSS Fragmentation"
  | "CSS Frequencies"
  | "CSS Generated Content"
  | "CSS Grid Layout"
  | "CSS Houdini"
  | "CSS Images"
  | "CSS Inline"
  | "CSS Lengths"
  | "CSS Lists and Counters"
  | "CSS Logical Properties"
  | "CSS Masking"
  | "CSS Miscellaneous"
  | "CSS Motion Path"
  | "CSS Namespaces"
  | "CSS Overflow"
  | "CSS Pages"
  | "CSS Positioning"
  | "CSS Regions"
  | "CSS Resolutions"
  | "CSS Ruby"
  | "CSS Scroll Anchoring"
  | "CSS Scrollbars"
  | "CSS Scroll Snap"
  | "CSS Shadow Parts"
  | "CSS Shapes"
  | "CSS Speech"
  | "CSS Table"
  | "CSS Text"
  | "CSS Text Decoration"
  | "CSS Times"
  | "CSS Transforms"
  | "CSS Transitions"
  | "CSS Types"
  | "CSS Units"
  | "CSS Variables"
  | "CSS View Transitions"
  | "CSS Will Change"
  | "CSS Writing Modes"
  | "CSSOM View"
  | "Filter Effects"
  | "Grouping Selectors"
  | "MathML"
  | "Media Queries"
  | "Microsoft Extensions"
  | "Mozilla Extensions"
  | "Pointer Events"
  | "Pseudo"
  | "Pseudo-classes"
  | "Pseudo-elements"
  | "Selectors"
  | "WebKit Extensions"
  )[]

type AnimationType = 
  | "angleBasicShapeOrPath"
  | "angleOrBasicShapeOrPath"
  | "basicShapeOtherwiseNo"
  | "byComputedValueType"
  | "byComputedValueTypeNormalAnimatesAsObliqueZeroDeg"
  | "color"
  | "discrete"
  | "discreteButVisibleForDurationWhenAnimatedHidden"
  | "discreteButVisibleForDurationWhenAnimatedNone"
  | "eachOfShorthandPropertiesExceptUnicodeBiDiAndDirection"
  | "filterList"
  | "fontStretch"
  | "fontWeight"
  | "integer"
  | "length"
  | "lpc"
  | "notAnimatable"
  | "numberOrLength"
  | "number"
  | "position"
  | "rectangle"
  | "repeatableList"
  | "shadowList"
  | "simpleListOfLpc"
  | "simpleListOfLpcDifferenceLpc"
  | "transform"
  | "visibility"

type Percentages = 
  | "blockSizeOfContainingBlock"
  | "dependsOnLayoutModel"
  | "inlineSizeOfContainingBlock"
  | "lengthsAsPercentages"
  | "logicalHeightOfContainingBlock"
  | "logicalWidthOfContainingBlock"
  | "logicalHeightOrWidthOfContainingBlock"
  | "mapToRange0To1"
  | "maxZoomFactor"
  | "minZoomFactor"
  | "no"
  | "referToBorderBox"
  | "referToContainingBlockHeight"
  | "referToDimensionOfBorderBox"
  | "referToDimensionOfContentArea"
  | "referToElementFontSize"
  | "referToFlexContainersInnerMainSize"
  | "referToHeightOfBackgroundPositioningAreaMinusBackgroundImageHeight"
  | "referToLineBoxWidth"
  | "referToLineHeight"
  | "referToParentElementsFontSize"
  | "referToSizeOfBackgroundPositioningAreaMinusBackgroundImageSize"
  | "referToSizeOfBorderImage"
  | "referToSizeOfBoundingBox"
  | "referToSizeOfContainingBlock"
  | "referToSizeOfElement"
  | "referToSizeOfFont"
  | "referToSizeOfMaskBorderImage"
  | "referToSizeOfMaskPaintingArea"
  | "referToTotalPathLength"
  | "referToWidthAndHeightOfElement"
  | "referToWidthOfAffectedGlyph"
  | "referToWidthOfBackgroundPositioningAreaMinusBackgroundImageWidth"
  | "referToWidthOfContainingBlock"
  | "referToWidthOrHeightOfBorderImageArea"
  | "referToReferenceBoxWhenSpecifiedOtherwiseBorderBox"
  | "regardingHeightOfGeneratedBoxContainingBlockPercentages0"
  | "regardingHeightOfGeneratedBoxContainingBlockPercentagesNone"
  | "regardingHeightOfGeneratedBoxContainingBlockPercentagesRelativeToContainingBlock"
  | "relativeToBackgroundPositioningArea"
  | "relativeToCorrespondingDimensionOfRelevantScrollport"
  | "relativeToMaskBorderImageArea"
  | "relativeToScrollContainerPaddingBoxAxis"
  | "relativeToTheScrollContainersScrollport"
  | "relativeToTimelineRangeIfSpecifiedOtherwiseEntireTimeline"
  | "relativeToWidthAndHeight"

type Computed = 
  | "absoluteLength"
  | "absoluteLength0ForNone"
  | "absoluteLength0IfColumnRuleStyleNoneOrHidden"
  | "absoluteLengthOr0IfBorderBottomStyleNoneOrHidden"
  | "absoluteLengthOr0IfBorderLeftStyleNoneOrHidden"
  | "absoluteLengthOr0IfBorderRightStyleNoneOrHidden"
  | "absoluteLengthOr0IfBorderTopStyleNoneOrHidden"
  | "absoluteLengthOrAsSpecified"
  | "absoluteLengthOrKeyword"
  | "absoluteLengthOrNone"
  | "absoluteLengthOrNormal"
  | "absoluteLengthOrPercentage"
  | "absoluteLengthsSpecifiedColorAsSpecified"
  | "absoluteLengthZeroIfBorderStyleNoneOrHidden"
  | "absoluteLengthZeroOrLarger"
  | "absoluteURIOrNone"
  | "angleRoundedToNextQuarter"
  | "asAutoOrColor"
  | "asDefinedForBasicShapeWithAbsoluteURIOtherwiseAsSpecified"
  | "asLength"
  | "asSpecified"
  | "asSpecifiedAppliesToEachProperty"
  | "asSpecifiedButVisibleOrClipReplacedToAutoOrHiddenIfOtherValueDifferent"
  | "asSpecifiedExceptMatchParent"
  | "asSpecifiedExceptPositionedFloatingAndRootElementsKeywordMaybeDifferent"
  | "asSpecifiedRelativeToAbsoluteLengths"
  | "asSpecifiedURLsAbsolute"
  | "asSpecifiedWithExceptionOfResolution"
  | "asSpecifiedWithLengthsAbsoluteAndNormalComputingToZeroExceptMultiColumn"
  | "asSpecifiedWithLengthValuesComputed"
  | "asSpecifiedWithVarsSubstituted"
  | "autoOnAbsolutelyPositionedElementsValueOfAlignItemsOnParent"
  | "autoOrRectangle"
  | "colorPlusThreeAbsoluteLengths"
  | "computedColor"
  | "consistsOfTwoDimensionKeywords"
  | "consistsOfTwoKeywordsForOriginAndOffsets"
  | "forLengthAbsoluteValueOtherwisePercentage"
  | "autoForTranslucentColorRGBAOtherwiseRGB"
  | "keywordOrNumericalValueBolderLighterTransformedToRealValue"
  | "keywordPlusIntegerIfDigits"
  | "lengthAbsolutePercentageAsSpecifiedOtherwiseAuto"
  | "listEachItemConsistingOfAbsoluteLengthPercentageAndOrigin"
  | "listEachItemConsistingOfNormalLengthPercentageOrNameLengthPercentage"
  | "listEachItemConsistingOfPairsOfAutoOrLengthPercentage"
  | "listEachItemHasTwoKeywordsOnePerDimension"
  | "listEachItemIdentifierOrNoneAuto"
  | "listEachItemTwoKeywordsOriginOffsets"
  | "noneOrImageWithAbsoluteURI"
  | "noneOrOrderedListOfIdentifiers"
  | "normalizedAngle"
  | "normalOnElementsForPseudosNoneAbsoluteURIStringOrAsSpecified"
  | "oneToFourPercentagesOrAbsoluteLengthsPlusFill"
  | "optimumValueOfAbsoluteLengthOrNormal"
  | "percentageAsSpecifiedAbsoluteLengthOrNone"
  | "percentageAsSpecifiedOrAbsoluteLength"
  | "percentageAutoOrAbsoluteLength"
  | "percentageOrAbsoluteLengthPlusKeywords"
  | "sameAsBoxOffsets"
  | "sameAsMaxWidthAndMaxHeight"
  | "sameAsMinWidthAndMinHeight"
  | "sameAsWidthAndHeight"
  | "specifiedIntegerOrAbsoluteLength"
  | "specifiedValueClipped0To1"
  | "specifiedValueNumberClipped0To1"
  | "theComputedLengthAndVisualBox"
  | "theKeywordListStyleImageNoneOrComputedValue"
  | "translucentValuesRGBAOtherwiseRGB"
  | "twoAbsoluteLengthOrPercentages"
  | "twoAbsoluteLengths"


type Order = 
  | "canonicalOrder"
  | "lengthOrPercentageBeforeKeywordIfBothPresent"
  | "lengthOrPercentageBeforeKeywords"
  | "oneOrTwoValuesLengthAbsoluteKeywordsPercentages"
  | "orderOfAppearance"
  | "percentagesOrLengthsFollowedByFill"
  | "perGrammar"
  | "uniqueOrder"

type AppliesTo = 
  | "absolutelyPositionedElements"
  | "allElements"
  | "allElementsAcceptingWidthOrHeight"
  | "allElementsAndPseudos"
  | "allElementsAndText"
  | "allElementsButNonReplacedAndTableColumns"
  | "allElementsButNonReplacedAndTableRows"
  | "allElementsCreatingNativeWindows"
  | "allElementsExceptGeneratedContentOrPseudoElements"
  | "allElementsExceptInlineBoxesAndInternalRubyOrTableBoxes"
  | "allElementsExceptInternalTableDisplayTypes"
  | "allElementsExceptNonReplacedInlineElementsTableRowsColumnsRowColumnGroups"
  | "allElementsExceptTableDisplayTypes"
  | "allElementsExceptTableElementsWhenCollapse"
  | "allElementsExceptTableRowColumnGroupsTableRowsColumns"
  | "allElementsExceptTableRowGroupsRowsColumnGroupsAndColumns"
  | "allElementsNoEffectIfDisplayNone"
  | "allElementsSomeValuesNoEffectOnNonInlineElements"
  | "allElementsSVGContainerElements"
  | "allElementsSVGContainerGraphicsAndGraphicsReferencingElements"
  | "allElementsThatCanReferenceImages"
  | "allElementsThatGenerateAPrincipalBox"
  | "allElementsTreeAbidingPseudoElementsPageMarginBoxes"
  | "allElementsUAsNotRequiredWhenCollapse"
  | "anyElementEffectOnProgressAndMeter"
  | "beforeAndAfterPseudos"
  | "blockContainerElements"
  | "blockContainers"
  | "blockContainersAndMultiColumnContainers"
  | "blockContainersExceptMultiColumnContainers"
  | "blockContainersExceptTableWrappers"
  | "blockContainersFlexContainersGridContainers"
  | "blockContainersMultiColumnContainersFlexContainersGridContainers"
  | "blockElementsInNormalFlow"
  | "blockLevelElements"
  | "blockLevelBoxesAndAbsolutelyPositionedBoxesAndGridItems"
  | "boxElements"
  | "childrenOfBoxElements"
  | "directChildrenOfElementsWithDisplayMozBoxMozInlineBox"
  | "elementsForWhichLayoutContainmentCanApply"
  | "elementsForWhichSizeContainmentCanApply"
  | "elementsThatAcceptInput"
  | "elementsWithDisplayBoxOrInlineBox"
  | "elementsWithDisplayMarker"
  | "elementsWithDisplayMozBoxMozInlineBox"
  | "elementsWithOverflowNotVisibleAndReplacedElements"
  | "exclusionElements"
  | "firstLetterPseudoElementsAndInlineLevelFirstChildren"
  | "flexContainers"
  | "flexItemsAndAbsolutelyPositionedFlexContainerChildren"
  | "flexItemsAndInFlowPseudos"
  | "flexItemsGridItemsAbsolutelyPositionedContainerChildren"
  | "flexItemsGridItemsAndAbsolutelyPositionedBoxes"
  | "floats"
  | "gridContainers"
  | "gridContainersWithMasonryLayout"
  | "gridContainersWithMasonryLayoutInTheirBlockAxis"
  | "gridContainersWithMasonryLayoutInTheirInlineAxis"
  | "gridItemsAndBoxesWithinGridContainer"
  | "iframeElements"
  | "images"
  | "inFlowBlockLevelElements"
  | "inFlowChildrenOfBoxElements"
  | "inlineBoxesAndBlockContainers"
  | "inlineLevelAndTableCellElements"
  | "listItems"
  | "maskElements"
  | "multicolElements"
  | "multiColumnElementsFlexContainersGridContainers"
  | "multilineFlexContainers"
  | "nonReplacedBlockAndInlineBlockElements"
  | "nonReplacedBlockElements"
  | "nonReplacedElements"
  | "nonReplacedInlineElements"
  | "positionedElements"
  | "positionedElementsWithADefaultAnchorElement"
  | "replacedElements"
  | "rubyAnnotationsContainers"
  | "rubyBasesAnnotationsBaseAnnotationContainers"
  | "sameAsMargin"
  | "sameAsWidthAndHeight"
  | "scrollContainers"
  | "scrollingBoxes"
  | "sensitiveTextInputs"
  | "tableCaptionElements"
  | "tableCellElements"
  | "tableElements"
  | "textAndBlockContainers"
  | "textElements"
  | "textFields"
  | "transformableElements"
  | "xulImageElements"

type AlsoApplyTo = 
  | ["::first-letter"]
  | ["::first-letter", "::first-line"]
  | ["::first-letter", "::placeholder"]
  | ["::first-letter", "::first-line", "::placeholder"]
  | ["::first-letter", "::placeholder", "::first-line"]
  | ["::first-line"]
  | ["::first-line", "::first-letter"]
  | ["::first-line", "::placeholder"]
  | ["::first-line", "::first-letter", "::placeholder"]
  | ["::first-line", "::placeholder", "::first-letter"]
  | ["::placeholder"]
  | ["::placeholder", "::first-letter"]
  | ["::placeholder", "::first-line"]
  | ["::placeholder", "::first-letter", "::first-line"]
  | ["::placeholder", "::first-line", "::first-letter"]

type Status = 
  | "standard"
  | "nonstandard"
  | "experimental"
  | "obsolete"

type MdnURL = `https://developer.mozilla.org/docs${string}`

type Media =
 | "all"
 | "aural"
 | "continuous"
 | "interactive"
 | "none"
 | "noPracticalMedia"
 | "paged"
 | "visual"
 | "visualInContinuousMediaNoEffectInOverflowColumns"
 | ["interactive", "paged"]
 | ["interactive", "visual"]
 | ["interactive", "paged", "visual"]
 | ["interactive", "visual", "paged"]
 | ["paged", "interactive"]
 | ["paged", "visual"]
 | ["paged", "interactive", "visual"]
 | ["paged", "visual", "interactive"]
 | ["visual", "interactive"]
 | ["visual", "paged"]
 | ["visual", "interactive", "paged"]
 | ["visual", "paged", "interactive"]