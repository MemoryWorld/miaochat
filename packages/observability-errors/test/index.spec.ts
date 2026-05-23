import { describe, it, expect } from "vitest";
import {
  MemoryErrorCaptureSink,
  ErrorContextStore,
  getGlobalErrorCaptureSink,
  setGlobalErrorCaptureSink,
  resetGlobalErrorCaptureSink,
  getGlobalErrorContextStore,
  createCapturedError,
  normalizeError,
} from "../src/index";

describe("observability-errors", () => {
  it("exports all symbols", () => {
    expect(MemoryErrorCaptureSink).toBeDefined();
    expect(ErrorContextStore).toBeDefined();
    expect(getGlobalErrorCaptureSink).toBeTypeOf("function");
    expect(setGlobalErrorCaptureSink).toBeTypeOf("function");
    expect(resetGlobalErrorCaptureSink).toBeTypeOf("function");
    expect(getGlobalErrorContextStore).toBeTypeOf("function");
    expect(createCapturedError).toBeTypeOf("function");
    expect(normalizeError).toBeTypeOf("function");
  });

  describe("MemoryErrorCaptureSink", () => {
    it("stores captured errors", () => {
      const sink = new MemoryErrorCaptureSink();
      const err = createCapturedError(new Error("boom"));
      sink.capture(err);
      expect(sink.events).toHaveLength(1);
      expect(sink.events[0].error.message).toBe("boom");
    });

    it("reset clears events", () => {
      const sink = new MemoryErrorCaptureSink();
      sink.capture(createCapturedError(new Error("x")));
      sink.reset();
      expect(sink.events).toHaveLength(0);
    });
  });

  describe("normalizeError", () => {
    it("normalizes Error instances", () => {
      const result = normalizeError(new TypeError("bad"));
      expect(result.name).toBe("TypeError");
      expect(result.message).toBe("bad");
      expect(result.stack).toBeDefined();
    });

    it("normalizes non-Error values", () => {
      const result = normalizeError("string error");
      expect(result.name).toBe("NonErrorThrowable");
      expect(result.message).toBe("string error");
    });
  });

  describe("createCapturedError", () => {
    it("returns correct shape", () => {
      const captured = createCapturedError(new Error("fail"), { conversationId: "c1" });
      expect(captured.context).toEqual({ conversationId: "c1" });
      expect(captured.error.message).toBe("fail");
      expect(captured.reportedAt).toBeDefined();
    });
  });

  describe("ErrorContextStore", () => {
    it("run and snapshot work", () => {
      const store = new ErrorContextStore();
      let snap: Record<string, unknown> = {};
      store.run({ conversationId: "c1" }, () => {
        snap = store.snapshot();
      });
      expect(snap.conversationId).toBe("c1");
    });
  });

  describe("global sink", () => {
    it("set/get/reset", () => {
      const sink = new MemoryErrorCaptureSink();
      setGlobalErrorCaptureSink(sink);
      expect(getGlobalErrorCaptureSink()).toBe(sink);
      resetGlobalErrorCaptureSink();
      expect(getGlobalErrorCaptureSink()).not.toBe(sink);
    });
  });
});
