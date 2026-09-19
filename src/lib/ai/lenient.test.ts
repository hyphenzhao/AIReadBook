import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lenientList } from "./lenient";

const schema = z.object({ methods: lenientList(z.object({ name: z.string(), quote: z.string().default("") }), 2) });

describe("lenientList", () => {
  it("wraps a single object the model returned in place of a list", () => {
    expect(schema.parse({ methods: { name: "EEG" } }).methods).toEqual([{ name: "EEG", quote: "" }]);
  });

  it("treats a missing or null list as empty", () => {
    expect(schema.parse({}).methods).toEqual([]);
    expect(schema.parse({ methods: null }).methods).toEqual([]);
  });

  it("drops malformed items and anything over the limit instead of failing", () => {
    const parsed = schema.parse({ methods: [{ name: "a" }, { nome: "typo" }, "junk", { name: "b" }, { name: "c" }] });
    expect(parsed.methods.map((m) => m.name)).toEqual(["a", "b"]);
  });
});
