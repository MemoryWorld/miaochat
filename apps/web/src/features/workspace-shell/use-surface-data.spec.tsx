// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSurfaceData } from "./use-surface-data";

const fetchMock = vi.fn<typeof fetch>();

function Probe() {
  const [tick, setTick] = React.useState(0);
  const surface = useSurfaceData<number[]>("/surface", []);

  return (
    <div>
      <button onClick={() => setTick((current) => current + 1)} type="button">
        rerender {tick}
      </button>
      <div data-testid="count">{surface.data.length}</div>
      <div data-testid="loading">{surface.isLoading ? "loading" : "idle"}</div>
    </div>
  );
}

describe("useSurfaceData", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("does not refetch endlessly when the caller passes an inline fallback value", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([1, 2]), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      })
    );

    render(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("2");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "rerender 0" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "rerender 1" })).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
