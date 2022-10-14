---
order: 2
---
# Explainer: Core ideas
This article summarizes the core technical aspects such as data structures, IO, and so on. It is a helpful introduction to understand WebWriter before extending it with your own widgets.

## Explorables
WebWriter is built to edit Explorables, which are...
- **web based**, built with client-side web standards and deployable on the web
- **file oriented**, available as all-in-one, standalone, offline-capable files
- **open**, conformant with OER principles allowing easy reuse
- **multimedial**, combining many media types such as text, audio, video, etc.
- **interactive**, allowing users to interact and receive feedback

At the core, Explorables are simply HTML documents. As such, they follow the standard APIs for everything (`HTMLDocument`), including display (DOM) and serialization (saving as HTML). They contain `content`, which is a sequence of zero or more widgets. Widgets are provided by packages.

| Concept         | DOM representation | Runtime representation              | File representation   |
|-----------------|--------------------|-------------------------------------|-----------------------|
| Explorable      | `HTMLDocument`     | `webwriter.Explorable`              | `.html`/`.h5p`        |
| Widget          | `HTMLElement`      | `webwriter.Widget`                  | HTML tag + attributes |
| Package         | -                  | `webwriter.WidgetConstructor`       | npm/yarn package      |

Another way to look at this is to consider the flow of data through WebWriter and related environments:
![WebWriter Data Flow Diagram](static/webwriter-data-architecture.drawio.svg)

## Widgets
Corresponding to Explorables, widgets are simply HTML elements, again implementing the same APIs (`HTMLElement`). This means that any element that can be defined in HTML can become a widget, as well. Widgets satisfy the interface `webwriter.Widget`.

## Metadata
Both Explorables and Widgets may have attached metadata. It is recommended to use a subset of the [schema.org LearningResource type](https://schema.org/LearningResource), but any number of key/value pairs serializable to JSON is permitted. Metadata can be thought of as a cascade:
1. Some metadata is constant for all Explorables and Widgets, being defined by the developer.
2. Other metadata depends on the type of Widget, and is thus defined by the Widget author.
3. Yet other metadata depends on the Widget or Explorable instance, and is thus defined by the end user.

*Note: Level 3 of the metadata cascade may be automatically annotated to some degree in the future.* 

## Packages
Packages are npm packages containing a main file that can be bundled by esbuild (JS .js file or TypeScript .ts file). Each package should register exactly one custom element with the same name as the package on import.

### Built-in Packages
The only difference between built-in and all other packages is that built-in packages come pre-installed with the editor. Otherwise, they implement the same interface. 

## I/O
All widget attributes are persisted, so widget instance state should be stored as attributes. This allows learners to save their changes locally just using the save function of their web browser since browsers implement the same behavior of persisting attributes.