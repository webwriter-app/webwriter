---
order: 6
---
# Explainer: Designing Widgets

## Introduction
As outlined in the [guide for creating widgets](./creatingwidgets.md), a widget can support many different attributes from the widget interface. Ideally, as many of these attributes as possible are supported. As such, this level of attribute coverage is an important measure of widget quality and can guide authors when picking widgets to install. Another measure is performance, considering both time requirements (loading time) and space requirements (bundle size). Finally, widget quality does not only from hard criteria like functionality and performance, but also from soft criteria that depend on the value the widget provides to the authors and learners.

## Functionality
The table below lists all core attributes that a widget can support. Most are actual attributes on the web component (those ending in `able`), but some (`stateful`, `documented`) are more general criteria.

| Attribute | Package Keyword | Requirements |
|-----------|-----------------|--------------|
💾 | `stateful` | Widget has one or more attributes that store widget state
✏️ | `editable` | When editable=true, allow user interaction to modify the widget. When editable=false, prevent user interaction modifying the widget.
🔍 | `analyzable` | When analyzable=true, emit DOM events enriched with xAPI statements.
📄 | `printable` | When printable=true, render content so that it can be printed on paper.
☀️ | `offlineable` | Stays usable even if the user is offline.
📖 | `documented` | Provides a user manual in Markdown format.

## Performance
*Work in Progress*: The table lists some metrics by which the performance of a widget can be measured.

| Performance Metric | Description |
|--------------------|-------------|
| 📦 BBS            | Baseline Bundle Size: Minimum size of HTML fragment output
| ⚡ LS             | Lighthouse Score: Loading performance of widget
| 🐏 RAM            | RAM Usage: Absolute increase of RAM/SWAP storage used under load
| ⚙️ CPU            | CPU Usage: Absolute increase of CPU/GPU used under load

## Usability
There are several sets of usability principles. For this explainer, we apply [Nielsen's 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/):
1. **Visibility of system status**: The design should always keep users informed about what is going on, through appropriate feedback within a reasonable amount of time.
2. **Match between system and the real world**: The design should speak the users' language. Use words, phrases, and concepts familiar to the user, rather than internal jargon. Follow real-world conventions, making information appear in a natural and logical order.
3. **User control and freedom**: Users often perform actions by mistake. They need a clearly marked "emergency exit" to leave the unwanted action without having to go through an extended process.
4. **Consistency and standards**: Users should not have to wonder whether different words, situations, or actions mean the same thing. Follow platform and industry conventions.
5. **Error prevention**: Good error messages are important, but the best designs carefully prevent problems from occurring in the first place. Either eliminate error-prone conditions, or check for them and present users with a confirmation option before they commit to the action.
6. **Recognition rather than recall**: Minimize the user's memory load by making elements, actions, and options visible. The user should not have to remember information from one part of the interface to another. Information required to use the design (e.g. field labels or menu items) should be visible or easily retrievable when needed.
7. **Flexibility and efficiency of use**: Shortcuts — hidden from novice users — may speed up the interaction for the expert user so that the design can cater to both inexperienced and experienced users. Allow users to tailor frequent actions.
8. **Aesthetic and minimalist design**: Interfaces should not contain information that is irrelevant or rarely needed. Every extra unit of information in an interface competes with the relevant units of information and diminishes their relative visibility.
9. **Help users recognize, diagnose, and recover from errors**: Error messages should be expressed in plain language (no error codes), precisely indicate the problem, and constructively suggest a solution.
10. **Help and documentation**: It’s best if the system doesn’t need any additional explanation. However, it may be necessary to provide documentation to help users understand how to complete their tasks.


## Value
*Work in Progress*:
- Usefulness for education as evaluated by experts

