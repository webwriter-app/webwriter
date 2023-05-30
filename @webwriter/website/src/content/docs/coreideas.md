---
order: 2
title: "Core ideas"
---
# Explainer: Core ideas
This article summarizes the core technical aspects such as data structures, IO, and so on. It is a helpful introduction to understand WebWriter before extending it with your own widgets.

## Explorables
WebWriter is built to edit Explorables, which are...
- **web based**, built with client-side web standards and deployable on the web
- **file oriented**, available as all-in-one, standalone, offline-capable files
- **open**, conformant with OER principles allowing easy reuse
- **multimedia**, combining many media types such as text, audio, video, etc.
- **interactive**, allowing users to interact and receive feedback

At the core, Explorables are simply HTML documents. Viewed as data structure, an Explorable is simply a DOM tree that be displayed by browsers and serialized to or parsed from HTML. WebWriter uses ProseMirror to make Explorables editable.

| Concept         | DOM representation | File representation   |
|-----------------|--------------------|-----------------------|
| Explorable      | `HTMLDocument`     | `.html`/`.h5p`        |
| Widget          | `HTMLElement`      | HTML tag + attributes |
| Package         | -                  | npm/yarn package      |

Another way to look at this is to consider the flow of data through WebWriter and related environments:
![WebWriter Data Flow Diagram](/src/public/assets/webwriter-data-architecture.drawio.svg)


## Widgets
Corresponding to Explorables, Widgets are simply HTML elements, again implementing the same APIs (`HTMLElement`). This means that any element that can be defined in HTML can become a Widget, as well. New HTML elements can be defined as Web Components.

## Packages
Packages are npm packages containing a main file that can be bundled by esbuild (JS .js file or TypeScript .ts file). Each package should register exactly one custom element with the same name as the package on import.

### Built-in Packages
The only difference between built-in and all other packages is that built-in packages come pre-installed with the editor. Otherwise, they implement the same interface. 

## I/O
All widget attributes are persisted, so widget instance state should be stored as attributes. This allows learners to save their changes locally just using the save function of their web browser since browsers implement the same behavior of persisting attributes.