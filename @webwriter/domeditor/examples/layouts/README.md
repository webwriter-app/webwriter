# Layout video source documents

These small HTML documents were opened in the real `DomEditor` component, using
its normal isolated editor frame and native editing. Each landing-page layout
preview is a five-second, silent recording of one sentence edit:

- Document: add “and butterflies” to the sentence about native flowers.
- Canvas: add “and birds” to the shelter note.
- Slides: add “and soaks in” to the sentence about rain.
- Board: add “each day” to the observation card.

The clips in `src/assets/layouts/` contain actual editor screenshots, cropped to
the authored content and its editing selection. No ribbon, app navigation, or
surrounding panels are included. Frames were captured during typing, paced to
five seconds, and encoded as H.264 MP4 (704 × 220, 30 fps, no audio, fast start).
The original theme and layout styles are embedded in the source documents so
they can also be opened directly as standalone WebWriter documents.

Localized source documents and recordings are provided in `de/`, `fr/`, `nl/`,
`es/`, `pt/`, and `it/`. Each localized clip shows the same kind of real edit:
adding a short sentence about butterflies, sheltering birds, water soaking into
the soil, or recording observations. These versions were captured with the
actual `DOMEditor` and native text editing, then cropped to 704 × 220 and paced
to five seconds. The selected site language chooses the corresponding video;
clips load only when a card is played.
