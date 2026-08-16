import { describe, expect, it } from "vitest";
import { validateJsx } from "./validator.js";

const valid = `import React from "react"; export default function App(){ return <main>实验</main>; }`;
describe("JSX security validator", () => {
  it("accepts the V1 contract", () => expect(validateJsx(valid).imports).toEqual(["react"]));
  it.each([
    [`import fs from "fs"; export default () => <div/>`, "SECURITY_BLOCKED"],
    [`export default () => { fetch("https://example.com"); return <div/> }`, "SECURITY_BLOCKED"],
    [`export default () => { eval("1"); return <div/> }`, "SECURITY_BLOCKED"],
    [`export default () => { import("unknown"); return <div/> }`, "SECURITY_BLOCKED"],
    [`export default () => { navigator.serviceWorker.register("/sw.js"); return <div/> }`, "SECURITY_BLOCKED"],
    [`import x from "unknown-package"; export default () => <div/>`, "IMPORT_NOT_ALLOWED"],
    [`export default 42`, "JSX_EXPORT_INVALID"],
  ])("blocks unsafe source", (source, code) => {
    try { validateJsx(source); throw new Error("accepted"); } catch (error) { expect((error as { code: string }).code).toBe(code); }
  });
});
