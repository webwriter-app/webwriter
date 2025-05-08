---
order: 100
title: "Designing"
type: "explainer"
---
# Designing Packages
There are different criteria for what makes a good widget. This guide outlines a few to help you improve your widget's design.

## Functionality Checklist
WebWriter expects widgets to implement certain functionality so its feature can work properly:
- [ ] The package name is as short as possible while still uniquely identifying its purpose.
- [ ] The package has a short description describing what authors can accomplish with it.
- [ ] The widget's state is restored accurately when reloaded (toggle Source Mode to test).
- [ ] The widget reflects each attribute change (try undo/redo to test).
- [ ] Any interaction with the widget focuses it, and focus is not lost between interactions.
- [ ] The widget maintains the same height when the options are moved to the side toolbox due to viewport resizing.

## Performance Checklist
Performance is a consideration that affects usability, especially for authors using WebWriter on older systems:
- [ ] Memory usage should be appropriately low for the widget's content.
- [ ] [Interaction To Next Paint (INP)](https://web.dev/articles/inp) should be 100ms or lower for each major interaction.

## Code Quality Checklist
- [ ] The widget makes no debugging or development logs in the console during usage.
- [ ] Importing only registers the widget itself, no other custom elements.
- [ ] The widget does not have side effects (such as modifying `window`, or adding elements to the document without user intent).
- [ ] Widget settings are represented as idiomatic HTML attributes, complex widget state is represented as a `<script>` child element with an appropriate `type`.

## Accessibility & Responsiveness Checklist
Accessibility in the context of widgets mostly means following the [WCAG](https://www.w3.org/TR/WCAG22/).
- [ ] The widget switches localization based on the `lang` attribute (English should be the default, your native language should be manually translated, other languages could be machine translated).
- [ ] The widget should be perceivable (with text alternatives, adaptable markup, distinguishable visuals).
- [ ] The widget should be operable (gives keyboard access, enough time, navigable structure, and input modalities).
- [ ] The widget should be understandable (is readable, predictable, and input assistive).
- [ ] The widget should be printable, using text alternatives where neccessary (e.g. for time based media such as videos).

## Usability Checklist
There are several sets of usability principles. For this explainer, we apply [Nielsen's 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/):
- [ ] **Visibility of system status**: The design should always keep users informed about what is going on, through appropriate feedback within a reasonable amount of time.
- [ ] **Match between system and the real world**: The design should speak the users' language. Use words, phrases, and concepts familiar to the user, rather than internal jargon. Follow real-world conventions, making information appear in a natural and logical order.
- [ ] **User control and freedom**: Users often perform actions by mistake. They need a clearly marked "emergency exit" to leave the unwanted action without having to go through an extended process.
- [ ] **Consistency and standards**: Users should not have to wonder whether different words, situations, or actions mean the same thing. Follow platform and industry conventions.
- [ ] **Error prevention**: Good error messages are important, but the best designs carefully prevent problems from occurring in the first place. Either eliminate error-prone conditions, or check for them and present users with a confirmation option before they commit to the action.
- [ ] **Recognition rather than recall**: Minimize the user's memory load by making elements, actions, and options visible. The user should not have to remember information from one part of the interface to another. Information required to use the design (e.g. field labels or menu items) should be visible or easily retrievable when needed.
- [ ] **Flexibility and efficiency of use**: Shortcuts — hidden from novice users — may speed up the interaction for the expert user so that the design can cater to both inexperienced and experienced users. Allow users to tailor frequent actions.
- [ ] **Aesthetic and minimalist design**: Interfaces should not contain information that is irrelevant or rarely needed. Every extra unit of information in an interface competes with the relevant units of information and diminishes their relative visibility.
- [ ] **Help users recognize, diagnose, and recover from errors**: Error messages should be expressed in plain language (no error codes), precisely indicate the problem, and constructively suggest a solution.
- [ ] **Help and documentation**: It’s best if the system doesn’t need any additional explanation. However, it may be necessary to provide documentation to help users understand how to complete their tasks.