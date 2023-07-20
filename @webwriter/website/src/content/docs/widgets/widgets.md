---
order: 100
title: Widgets
---


# Widgets
Widgets are interactive multimedia elements that can be part of an explorable. They can developed using web technologies and published as packages.

## Technical View
Corresponding to Explorables, Widgets are simply HTML elements, again implementing the same APIs (`HTMLElement`). This means that any element that can be defined in HTML can become a Widget, as well. New HTML elements can be defined as Web Components. This means a widget can support any and every web technology capable of running in the browser. This includes [standard web APIs](https://developer.mozilla.org/en-US/docs/Web/API), [JS packages/modules for the browser](https://www.npmjs.com/), and so on.
As each widget comes in a [Package](../packages/packages.md) that is loaded and bundled with `esbuild` when a document is saved, 
[all content types of esbuild are supported](https://esbuild.github.io/content-types/).
**Practically, this means you can use JavaScript-adjacent technology such TypeScript, CSS, JSON and more.**

## Author/User View
To authors, widgets are part of a broad palette to create an explorable. They may use the different rich text elements provided by WebWriter and mix them with other available widgets. To users, widgets are just parts of the explorable they are viewing. Widgets are a seamless part of the page and probably not considered very closely by users.