import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SetupFlow } from "./setup-flow";

const fetchMock = vi.fn<typeof fetch>();

describe("SetupFlow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("loads saved credentials and lets the user validate then save a selected provider", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Codex credential passed local format validation.",
            providerAccountId: "acct_codex",
            valid: true
          }),
          {
            headers: {
              "Content-Type": "application/json"
            },
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialSource: "user_provided",
            id: "cred_1",
            label: "Codex primary",
            provider: "codex",
            providerAccountId: "acct_codex",
            validationState: "valid",
            workspaceId: "default-workspace"
          }),
          {
            headers: {
              "Content-Type": "application/json"
            },
            status: 201
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              credentialSource: "user_provided",
              id: "cred_1",
              label: "Codex primary",
              provider: "codex",
              providerAccountId: "acct_codex",
              validationState: "valid",
              workspaceId: "default-workspace"
            }
          ]),
          {
            headers: {
              "Content-Type": "application/json"
            },
            status: 200
          }
        )
      );

    render(<SetupFlow />);

    await screen.findByText("Nothing has been saved in the default workspace yet.");

    fireEvent.change(screen.getByLabelText("Credential label"), {
      target: {
        value: "Codex primary"
      }
    });
    fireEvent.change(screen.getByLabelText("Provider account identifier"), {
      target: {
        value: "acct_codex"
      }
    });
    fireEvent.change(screen.getByLabelText("Provider secret"), {
      target: {
        value: "sk-demo"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Validate credential" }));

    await screen.findByText("Validation passed");

    fireEvent.click(screen.getByRole("button", { name: "Save and bind" }));

    await waitFor(() => {
      expect(screen.getByText("Codex primary")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3001/credentials/validate",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:3001/credentials",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("switches provider guidance when a different provider is selected", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify([]), {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      })
    );

    render(<SetupFlow />);

    await screen.findByText("Nothing has been saved in the default workspace yet.");

    fireEvent.click(screen.getByRole("button", { name: /Hermes/i }));

    expect(screen.getByText("Expected prefix: hermes_")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Hermes engineering key")).toBeInTheDocument();
  });
});
