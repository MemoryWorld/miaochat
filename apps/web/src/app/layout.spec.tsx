import type { ReactNode } from "react";
import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  IBM_Plex_Mono: () => ({
    variable: "font-mono"
  }),
  Space_Grotesk: () => ({
    variable: "font-sans"
  })
}));

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
