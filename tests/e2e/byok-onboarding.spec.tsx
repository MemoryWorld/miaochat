import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SetupFlow } from "../../apps/web/src/features/setup/setup-flow";

const fetchMock = vi.fn<typeof fetch>();

describe("byok onboarding flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("selects a provider, validates credentials, and shows the bound credential list", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
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
            message: "OpenClaw credential passed local format validation.",
            providerAccountId: "acct_openclaw",
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
            id: "cred_openclaw",
            label: "OpenClaw ops",
            provider: "openclaw",
            providerAccountId: "acct_openclaw",
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
              id: "cred_openclaw",
              label: "OpenClaw ops",
              provider: "openclaw",
              providerAccountId: "acct_openclaw",
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

    fireEvent.click(screen.getByRole("button", { name: /OpenClaw/i }));
    fireEvent.change(screen.getByLabelText("Credential label"), {
      target: {
        value: "OpenClaw ops"
      }
    });
    fireEvent.change(screen.getByLabelText("Provider account identifier"), {
      target: {
        value: "acct_openclaw"
      }
    });
    fireEvent.change(screen.getByLabelText("Provider secret"), {
      target: {
        value: "openclaw_demo_secret"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Validate credential" }));

    await screen.findByText("Validation passed");

    fireEvent.click(screen.getByRole("button", { name: "Save and bind" }));

    await waitFor(() => {
      expect(screen.getByText("Credential saved")).toBeInTheDocument();
    });

    expect(screen.getByText("OpenClaw ops")).toBeInTheDocument();
    expect(screen.getByText(/acct_openclaw · valid/)).toBeInTheDocument();
  });
});
