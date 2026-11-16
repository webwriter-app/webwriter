// The form callbacks of a form-associated widget are looked up on the class,
// so `createReactWidget()` forwards them to what a mounted component registered here.
export const formCallbacks = new WeakMap()
