---
order: 200
title: Packages
---


# Packages
Packages are the publishing format for widgets. Users can get developed widgets by installing published packages via WebWriter.

## Technical View
Packages are npm packages containing a main file that can be bundled by esbuild (JS .js file or TypeScript .ts file). Each package should register exactly one custom element with the same name as the package on import.

### Built-in Packages
The only difference between built-in and all other packages is that built-in packages come pre-installed with the editor. Otherwise, they implement the same interface. 

## Author/User View
To authors, packages are mostly indistinguishable from widgets. This is especially true because each package holds exactly one widget. They install/update/uninstall packages from WebWriter's package manager. To users, packages are no concern at all - they only interact with the widgets bundled into explorables.