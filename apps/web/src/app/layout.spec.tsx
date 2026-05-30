import type { ReactNode } from "react";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("suppresses root hydration warnings from extension-injected html attributes", () => {
    const element = RootLayout({
      children: "content" as ReactNode
    });

    expect(isValidElement(element)).toBe(true);
    expect(element.props.suppressHydrationWarning).toBe(true);
  });
});
