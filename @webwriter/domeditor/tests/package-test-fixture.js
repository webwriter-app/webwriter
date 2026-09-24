// A package test module as built by @webwriter/build: it reports mocha's
// progress through test-update events on its window.
const update = detail => window.dispatchEvent(new CustomEvent("test-update", {detail}))
update({type: "beforeAll"})
update({type: "beforeOne", id: "a", path: ["Fixture", "passes"]})
update({type: "afterOne", id: "a", path: ["Fixture", "passes"], passed: true, duration: 1})
update({type: "afterOne", id: "b", path: ["Fixture", "fails"], passed: false, duration: 1})
update({type: "afterAll"})
