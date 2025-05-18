export const getMochaConfig = () => ({
    ui: "bdd",
    rootHooks: {
      beforeAll: function(done) {
        window.dispatchEvent(new CustomEvent("test-update", {bubbles: true, detail: {
          type: "beforeAll",
        }}))
        done()
      },
      beforeEach: function(done) {
        window.dispatchEvent(new CustomEvent("test-update", {bubbles: true, detail: {
          type: "beforeOne",
          id: this.currentTest.id,
          path: this.currentTest.titlePath(),
          sync: this.currentTest.sync
        }}))
        done()
      },
      afterEach: function(done) {
        window.dispatchEvent(new CustomEvent("test-update", {bubbles: true, detail: {
          type: "afterOne",
          id: this.currentTest.id,
          path: this.currentTest.titlePath(),
          passed: this.currentTest.isPassed(),
          duration: this.currentTest.duration,
          sync: this.currentTest.sync,
          timedOut: this.currentTest.timedOut
        }}))
        done()
      },
      afterAll: function(done) {
        window.dispatchEvent(new CustomEvent("test-update", {bubbles: true, detail: {
          type: "afterAll",
        }}))
        done()
      },
    },
    reporter: "min"
})