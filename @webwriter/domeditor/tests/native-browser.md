# Native browser regression checks

Run the loopback fixture with the installed Google Chrome binary:

```sh
npm run test:native-browser
```

The command serves `tests/native-browser.html` on `127.0.0.1` and runs it in headless Chrome. It covers native selection preservation, custom-element editing boundaries, `elementFromPoint` layout hit testing, and iframe load/removal lifecycle. Canvas checks exercise conversion with authored transforms, negative coordinates, zoom-aware movement, edge panning and release, text splitting, serialization, and return to normal flow. It exits nonzero if a check fails. Set `CHROME_BIN` to use another installed Chromium based browser.
