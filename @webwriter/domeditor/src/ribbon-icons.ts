import {unsafeSVG} from "lit/directives/unsafe-svg.js"

import arrowBackUp from "@tabler/icons/outline/arrow-back-up.svg?raw"
import arrowForwardUp from "@tabler/icons/outline/arrow-forward-up.svg?raw"
import arrowsMove from "@tabler/icons/outline/arrows-move.svg?raw"
import alignLeft from "@tabler/icons/outline/align-left.svg?raw"
import bold from "@tabler/icons/outline/bold.svg?raw"
import boxMargin from "@tabler/icons/outline/box-margin.svg?raw"
import clearFormatting from "@tabler/icons/outline/clear-formatting.svg?raw"
import clipboard from "@tabler/icons/outline/clipboard.svg?raw"
import code from "@tabler/icons/outline/code.svg?raw"
import columns3 from "@tabler/icons/outline/columns-3.svg?raw"
import colorSwatch from "@tabler/icons/outline/color-swatch.svg?raw"
import copy from "@tabler/icons/outline/copy.svg?raw"
import deviceFloppy from "@tabler/icons/outline/device-floppy.svg?raw"
import dots from "@tabler/icons/outline/dots.svg?raw"
import download from "@tabler/icons/outline/download.svg?raw"
import fileOrientation from "@tabler/icons/outline/file-orientation.svg?raw"
import filePlus from "@tabler/icons/outline/file-plus.svg?raw"
import folderOpen from "@tabler/icons/outline/folder-open.svg?raw"
import h1 from "@tabler/icons/outline/h-1.svg?raw"
import h2 from "@tabler/icons/outline/h-2.svg?raw"
import h3 from "@tabler/icons/outline/h-3.svg?raw"
import h4 from "@tabler/icons/outline/h-4.svg?raw"
import h5 from "@tabler/icons/outline/h-5.svg?raw"
import h6 from "@tabler/icons/outline/h-6.svg?raw"
import heading from "@tabler/icons/outline/heading.svg?raw"
import highlight from "@tabler/icons/outline/highlight.svg?raw"
import italic from "@tabler/icons/outline/italic.svg?raw"
import layersUnion from "@tabler/icons/outline/layers-union.svg?raw"
import lineHeight from "@tabler/icons/outline/line-height.svg?raw"
import list from "@tabler/icons/outline/list.svg?raw"
import listDetails from "@tabler/icons/outline/list-details.svg?raw"
import listNumbers from "@tabler/icons/outline/list-numbers.svg?raw"
import math from "@tabler/icons/outline/math.svg?raw"
import maximize from "@tabler/icons/outline/maximize.svg?raw"
import palette from "@tabler/icons/outline/palette.svg?raw"
import photo from "@tabler/icons/outline/photo.svg?raw"
import pilcrow from "@tabler/icons/outline/pilcrow.svg?raw"
import printer from "@tabler/icons/outline/printer.svg?raw"
import rulerMeasure from "@tabler/icons/outline/ruler-measure.svg?raw"
import scissors from "@tabler/icons/outline/scissors.svg?raw"
import share3 from "@tabler/icons/outline/share-3.svg?raw"
import stack from "@tabler/icons/outline/stack.svg?raw"
import superscript from "@tabler/icons/outline/superscript.svg?raw"
import table from "@tabler/icons/outline/table.svg?raw"
import textSize from "@tabler/icons/outline/text-size.svg?raw"
import typography from "@tabler/icons/outline/typography.svg?raw"
import underline from "@tabler/icons/outline/underline.svg?raw"
import vector from "@tabler/icons/outline/vector.svg?raw"
import video from "@tabler/icons/outline/video.svg?raw"
import volume from "@tabler/icons/outline/volume.svg?raw"
import worldWww from "@tabler/icons/outline/world-www.svg?raw"
import zoomIn from "@tabler/icons/outline/zoom-in.svg?raw"

const icons: Record<string, string> = {
  Undo: arrowBackUp,
  Redo: arrowForwardUp,
  New: filePlus,
  Open: folderOpen,
  Save: deviceFloppy,
  Print: printer,
  Download: download,
  Share: share3,
  Paste: clipboard,
  Cut: scissors,
  Copy: copy,
  Bold: bold,
  Italic: italic,
  Underline: underline,
  Align: alignLeft,
  Lists: list,
  Spacing: lineHeight,
  Paragraph: pilcrow,
  "Preformatted Text": code,
  "Heading 1": h1,
  "Heading 2": h2,
  "Heading 3": h3,
  "Heading 4": h4,
  "Heading 5": h5,
  "Heading 6": h6,
  "Bulleted List": list,
  "Numbered List": listNumbers,
  Details: listDetails,
  Table: table,
  Image: photo,
  Graphic: vector,
  Audio: volume,
  Video: video,
  Website: worldWww,
  Formula: math,
  Heading: heading,
  Theme: palette,
  Clear: clearFormatting,
  Family: typography,
  Size: textSize,
  Color: colorSwatch,
  Highlight: highlight,
  Superscript: superscript,
  More: dots,
  Margins: boxMargin,
  Columns: columns3,
  Orientation: fileOrientation,
  Position: arrowsMove,
  Order: stack,
  Group: layersUnion,
  Zoom: zoomIn,
  Guides: rulerMeasure,
  Fullscreen: maximize,
}

const fallbackIcon = dots

/** Returns a trusted inline Tabler SVG for a ribbon action. */
export const ribbonIcon = (label: string) => unsafeSVG(icons[label] ?? fallbackIcon)
