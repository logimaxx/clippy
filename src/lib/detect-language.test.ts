import { describe, expect, test } from "bun:test";
import { detectLanguage } from "../../assets/src/detect-language.js";

describe("detectLanguage", () => {
  test("returns null for short or empty text", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("const x = 1")).toBeNull();
    expect(detectLanguage("hello world")).toBeNull();
  });

  test("detects json", () => {
    expect(detectLanguage('{\n  "name": "webklip",\n  "ok": true\n}\n')).toBe("json");
    expect(detectLanguage('[\n  1,\n  2,\n  3\n]\n')).toBe("json");
  });

  test("detects javascript", () => {
    expect(
      detectLanguage(`const greet = (name) => {
  console.log("hi", name);
};
`)
    ).toBe("javascript");
  });

  test("detects typescript", () => {
    expect(
      detectLanguage(`interface User {
  id: string;
  name: string;
}
export const u: User = { id: "1", name: "a" };
`)
    ).toBe("typescript");
  });

  test("detects python", () => {
    expect(
      detectLanguage(`def main():
    print("hello")

if __name__ == "__main__":
    main()
`)
    ).toBe("python");
  });

  test("detects bash from shebang", () => {
    expect(
      detectLanguage(`#!/usr/bin/env bash
set -euo pipefail
echo "hi"
`)
    ).toBe("bash");
  });

  test("detects html", () => {
    expect(
      detectLanguage(`<!DOCTYPE html>
<html>
  <body>
    <div class="wrap">Hello</div>
  </body>
</html>
`)
    ).toBe("html");
  });

  test("detects css", () => {
    expect(
      detectLanguage(`.card {
  display: flex;
  color: #111;
  margin: 1rem;
  padding: 8px;
}
`)
    ).toBe("css");
  });

  test("detects sql", () => {
    expect(
      detectLanguage(`SELECT id, name
FROM users
WHERE active = true
ORDER BY name;
`)
    ).toBe("sql");
  });

  test("detects yaml", () => {
    expect(
      detectLanguage(`name: webklip
version: 1
services:
  api:
    image: app:latest
`)
    ).toBe("yaml");
  });

  test("detects markdown with multiple signals", () => {
    expect(
      detectLanguage(`# Title

Some intro with a [link](https://example.com).

- one
- two

\`\`\`js
console.log(1)
\`\`\`
`)
    ).toBe("markdown");
  });

  test("does not treat plain prose as markdown", () => {
    expect(
      detectLanguage(
        "This is just a normal paragraph about shipping notes for the team tomorrow."
      )
    ).toBeNull();
  });

  test("prefers json over javascript for parseable objects", () => {
    expect(detectLanguage('{"const": true, "let": false, "var": null}\n')).toBe("json");
  });
});
