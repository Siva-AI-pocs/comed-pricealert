import "@testing-library/jest-dom/vitest";

// jsdom has no 2D canvas context and logs a noisy "Not implemented" error
// whenever a chart mounts. Return null silently — chart components guard on a
// falsy context and skip rendering; chart unit tests override this to a stub.
HTMLCanvasElement.prototype.getContext = () => null;
