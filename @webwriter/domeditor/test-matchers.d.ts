import type {TestingLibraryMatchers} from "@testing-library/jest-dom/matchers"

declare module "@vitest/expect" {
  interface Assertion<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
