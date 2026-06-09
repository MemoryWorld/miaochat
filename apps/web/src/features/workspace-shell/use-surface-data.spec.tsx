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

function PreserveProbe() {
  const surface = useSurfaceData<number[]>("/surface", [], {
    preserveDataOnError: true
  });

  return (
    <div>
      <button onClick={() => void surface.refresh()} type="button">
        refresh
      </button>
      <div data-testid="count">{surface.data.length}</div>
      <div data-testid="error">{surface.error ?? "none"}</div>
      <div data-testid="loaded">{surface.hasSuccessfulLoad ? "loaded" : "empty"}</div>
    </div>
  );
}

function PreserveWhenDisabledProbe() {
  const [isEnabled, setIsEnabled] = React.useState(true);
  const [resetKey, setResetKey] = React.useState("workspace-a");
  const surface = useSurfaceData<number[]>(
    isEnabled ? `/surface?workspaceId=${resetKey}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey
    }
  );

  return (
    <div>
      <button onClick={() => setIsEnabled(false)} type="button">
        disable
      </button>
      <button onClick={() => setIsEnabled(true)} type="button">
        enable
      </button>
      <button onClick={() => setResetKey("workspace-b")} type="button">
        switch workspace
      </button>
      <div data-testid="count">{surface.data.length}</div>
      <div data-testid="loaded">{surface.hasSuccessfulLoad ? "loaded" : "empty"}</div>
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

  it("keeps the last successful data when preserveDataOnError is enabled", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify([1, 2]), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Unauthorized" }), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 401
        })
      );

    render(<PreserveProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("2");
    });
    expect(screen.getByTestId("loaded")).toHaveTextContent("loaded");

    fireEvent.click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("Unauthorized");
    });
    expect(screen.getByTestId("count")).toHaveTextContent("2");
    expect(screen.getByTestId("loaded")).toHaveTextContent("loaded");
  });

  it("keeps the last successful data when the surface is temporarily disabled", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([1, 2]), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      })
    );

    render(<PreserveWhenDisabledProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("2");
    });
    expect(screen.getByTestId("loaded")).toHaveTextContent("loaded");

    fireEvent.click(screen.getByRole("button", { name: "disable" }));

    expect(screen.getByTestId("count")).toHaveTextContent("2");
    expect(screen.getByTestId("loaded")).toHaveTextContent("loaded");

    fireEvent.click(screen.getByRole("button", { name: "switch workspace" }));

    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(screen.getByTestId("loaded")).toHaveTextContent("empty");
  });
});
