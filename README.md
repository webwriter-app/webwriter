# WebWriter

## Tech
- UI: lit
- State: xstate

### Top Level Document
Provides basic functionality:
- Save: Call `display` for each widget (passing parameters), adding components:
    - sharable: Add a `share` component, sending state somewhere
    - trackable: Add a `track` component, emitting events as xAPI statements
- Load: Extract `data` blobs, call `edit` for each

### Widget/Content Types
All content types are plugins. Content types provide:
1. A schema `data`
2. A function `edit: data -> editor` 
3. A function `display: data -> widget`
    - editable: embeds `data` into widget
    - printable: embeds printable alternate markup and a print stylesheet

#### Built-in types
- Rich text (includes multimedia)
- Code
- H5P wrapper

### I/O
[data1, data2, ...] --display--> HTML --print--> PDF/Paper