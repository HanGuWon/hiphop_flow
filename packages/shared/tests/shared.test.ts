import { describe, expect, it } from "vitest";
import { createId, err, ok, resetIdCounterForTests } from "../src";

describe("@hipflow/shared", () => {
  it("creates typed results and deterministic ids for a test run", () => {
    resetIdCounterForTests();

    expect(ok("ready")).toEqual({ ok: true, value: "ready" });
    expect(err("nope")).toEqual({ ok: false, error: "nope" });
    expect(createId("cell")).toBe("cell_1");
  });
});
