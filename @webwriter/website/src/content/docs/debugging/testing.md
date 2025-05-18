---
order: 701
title: "Testing"
---

# Testing
WebWriter can serve as a test runner. Packages may define and exports tests as package members. Each test module is loaded in an empty editor frame and results are reported in WebWriter's UI. Optionally, tests can be rerun each time a source file changes (hot reloading).

## Using Mocha (recommended)
In this setup, we will be using the browser version of [Mocha](https://mochajs.org/), a popular test runner for JS. For details about Mocha, refer to [the documentation](https://mochajs.org/).

### Install dependencies
For the following steps to work, we need to add a few development dependencies.

**Run in your project directory**
```
npm install --save-dev mocha @types/mocha chai @webwriter/build
```

### Create and export test module
As a first step, we need to create a test module file. This can go anywhere in your source. Typical choices are to either create a separate `test` directory, or to co-locate your tests with your source code.

For WebWriter to pick up your tests, you need to add them to your `exports` in your `package.json`. If you want your tests to be compiled (recommended), you need to point WebWriter to both the source file and the output path (same as with widgets).

**Export test in `package.json`**
```json
{
    "exports": {
        "./tests/functionality.*": {
            "source": "./tests/functionality.test.ts",
            "default": "./dist/tests/functionality.*"
        }
        // ...
    }
    // ...
}
```

You can add as many test modules as you want - each will run in a separate frame.

### Add Mocha boilerplate
In our test file, we need some setup code for Mocha to function. 

**`./tests/functionality.test.ts`: Boilerplate**
```ts
import "mocha/mocha.js";
import {getMochaConfig} from "@webwriter/build/test"

mocha.setup(getMochaConfig())

// TESTS HERE

mocha.run()
```


### Add tests
Now, we define our tests. For this, we make use of the assertion library [Chai](https://www.chaijs.com/), which helps with writing concise tests.

For our first test, we simply want to check whether the widget is defined after it is added to the page. If there is an error in the constructor/`connectedCallback` or the element is not properly registered for example, this test will fail.

**`./tests/functionality.test.ts`: Add tests**
```ts
import "mocha/mocha.js";
import {getMochaConfig} from "@webwriter/build/test"
import { assert } from "chai" // Import Chai for assertions
import "../src/widgets/my-widget" // IMPORTANT: Import widget so custom element is registered!

mocha.setup(getMochaConfig())

describe("<my-widget>", function () {

  before(function () { // Fixture: Set up page for test
    document.body.insertAdjacentHTML("beforeend",
      `<my-widget></my-widget>`
    )
  }) 

  describe("initialize", function () { // add test suite
    it("is defined", async function () { // add test (should be async so it is run after widget has initialized itself)
      const el = document.querySelector("my-widget:defined")
      assert.isNotNull(el)
    })
  })
});

mocha.run()
```

Tests are treated as normal modules by WebWriter's build tool, so you can write them in TypeScript and import code as usual. You can add as many suites/tests as you want in a single file.

### Run tests
Finally, we can use WebWriter's UI to run the test. Once you added your local package to WebWriter, switch to testing mode (enable 'source commands' in WebWriter's options, then toggle with the 'test' button at the top right).

Next, you can run your tests either by clicking a button or have them run automatically each time a source file changes (use this with the `@webwriter/build dev` command for hot reloading). Test/fail results should be reported in the UI, and details can be checked in the console.

## Other test runners
While Mocha is recommended and supported with a premade config, any test runners can be connected through a simple interface.

Essentially, WebWriter needs to receive events about the running of tests to display the report in the UI. For that, it listens for a custom `test-update` event on the test frame's window. To support a test runner, we can simply fire that event at the appropriate point in the test running lifecycle.

#### `beforeAll`
This event indicates that the test runner is set up and tests are about to run (should fire once).
```ts
window.dispatchEvent(new CustomEvent("test-update", {detail: {
    type: "beforeAll"
}}))
```

#### `beforeOne`
This event indicates that a test in the test module is about to run (can fire multiple times).
```ts
window.dispatchEvent(new CustomEvent("test-update", {detail: {
    type: "beforeAll",
    id: "abc123", // unique ID for the test about to run
    path: ["<my-widget>", "API", "foo()"]  // path of labels for the test about to run (shown as a tree in the UI)
}}))
```

#### `afterOne`
This event indicates that a test in the test module has run (can fire multiple times).
```ts
window.dispatchEvent(new CustomEvent("test-update", {detail: {
    type: "beforeAll",
    id: "abc123", // unique ID for the test
    path: ["<my-widget>", "API", "foo()"],  // path of labels for the test (shown as a tree in the UI)
    passed: true, // whether the test passed or failed

    duration: 23, // OPTIONAL: Time the test took to complete
    sync: true, // OPTIONAL: Whether the test is synchronous or asynchronous code
    timedOut: false // OPTIONAL: Whether the test failed by timeout
}}))
```

#### `afterAll`
This event indicates that all tests in the test module have run (should fire once).
```ts
window.dispatchEvent(new CustomEvent("test-update", {detail: {
    type: "afterAll"
}}))
```