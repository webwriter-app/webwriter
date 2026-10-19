# Layout video source documents

These documents are opened in the real `DOMEditor`, in its isolated editor
frame. Each preview records one native sentence edit, then holds the result:

- Document: add “and butterflies” beside an illustrated pollinator patch.
- Canvas: add “and birds” beside a live pollination flowchart.
- Slides: add “and soaks in” beside a live rainfall timeline.
- Board: add “each day” beside an illustrated garden map.

The Canvas source uses `@webwriter/flowchart@2.1.1`; Slides uses
`@webwriter/timeline@2.1.1`. The widgets have localized authored content and
remain in their reader presentation while the adjacent rich text is edited.
The source documents retain their published package imports for standalone use.
An isolated editor must resolve and install these packages through its normal
widget loading action, including the scoped custom-element registry adapter.
Initialize the timeline title/event modules before its container and verify that
its dated entries are visible before recording; an early capture can show the
widget’s empty state.

All four layouts have source documents and recordings in English, German,
French, Dutch, Spanish, Portuguese, and Italian. The selected site language
chooses the recording, and video resources load only when a card is played.

Capture the actual editor into 1280 × 720 frames. Frame the flowing Document page with just its side gutters visible, cropping
vertically around the section heading, editable paragraph, and illustration.
Float the illustration right and use ordinary block paragraphs so text wraps
along its left edge. Keep these elements directly in the body without an inner
card. Frame the complete native 16:9 slide for Slides, with its
headings, live timeline, and editable text placed directly on the slide. Use the
editor's slide zoom action to reveal its boundaries and surrounding workspace.
Capture Document at 1.85×, keeping the paper about 777 captured pixels wide.
For Slides, seven native zoom-out steps followed by 1.75× capture magnification show the slide at about 625 × 352
captured pixels. Capture Canvas and Board at 1×, centering the full arrangement
of neighboring notes or columns. Keep application navigation and the ribbon
outside the capture. Keep the viewport and camera fixed throughout the
edit. Capture each typed character, hold the initial and final sentence, and
encode five seconds at 30 fps as H.264 MP4, CRF 16, yuv420p, no audio, fast start.
Pad outer capture edges when necessary; do not upscale lower-resolution captures.

The video has a fixed 640 × 360 CSS-pixel footprint: its double-density source
keeps text sharp on high-density displays. Each responsive card symmetrically crops that
footprint with `overflow: hidden`; changing the card width never changes the
scale of the recorded content. Cards are at most 31rem wide, with larger gaps
and video heroes between 12rem and 13rem high.
