"use client";

import { useEffect, useState } from "react";

import { CredentialForm, type CredentialDraft } from "./credential-form";
import {
  defaultWorkspaceId,
  getProviderById,
  providerCatalog,
  type SetupProvider
} from "./provider-catalog";
import { ProviderSelector } from "./provider-selector";
import { ValidationState } from "./validation-state";

type CredentialMetadata = {
  credentialSource: string;
  id: string;
  label: string;
  provider: SetupProvider;
  providerAccountId: string;
  validationState: string;
  workspaceId: string;
};

type ValidationSnapshot = {
  message?: string;
  providerAccountId?: string;
  status: "idle" | "invalid" | "saved" | "saving" | "valid" | "validating";
};

const initialDraft: CredentialDraft = {
  label: "",
  providerAccountId: "",
  rawSecret: ""
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export function SetupFlow() {
  const [selectedProvider, setSelectedProvider] = useState<SetupProvider>("codex");
  const [draft, setDraft] = useState<CredentialDraft>(initialDraft);
  const [savedCredentials, setSavedCredentials] = useState<CredentialMetadata[]>([]);
  const [state, setState] = useState<ValidationSnapshot>({
    status: "idle"
  });

  const selectedProfile = getProviderById(selectedProvider);
  const isBusy = state.status === "saving" || state.status === "validating";
  const canSave =
    state.status === "valid" &&
    draft.label.trim().length > 0 &&
    draft.providerAccountId.trim().length > 0 &&
    draft.rawSecret.trim().length > 0;

  useEffect(() => {
    void loadCredentials();
  }, []);

  function updateDraft(field: keyof CredentialDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: value
    }));
    setState({
      status: "idle"
    });
  }

  function selectProvider(provider: SetupProvider) {
    setSelectedProvider(provider);
    setState({
      status: "idle"
    });
  }

  async function loadCredentials() {
    const response = await fetch(
      `${apiBaseUrl}/credentials?workspaceId=${defaultWorkspaceId}`
    );
    const payload = (await response.json()) as CredentialMetadata[];
    setSavedCredentials(payload);
  }

  async function validateCredential() {
    setState({
      message: `${selectedProfile.name} credential is being checked against the current provider rules.`,
      status: "validating"
    });

    const response = await fetch(`${apiBaseUrl}/credentials/validate`, {
      body: JSON.stringify({
        ...draft,
        provider: selectedProvider,
        workspaceId: defaultWorkspaceId
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const payload = (await response.json()) as {
      message?: string;
      providerAccountId: string;
      valid: boolean;
    };

    setState({
      message:
        payload.message ??
        `${selectedProfile.name} credential validation completed without a provider message.`,
      providerAccountId: payload.providerAccountId,
      status: payload.valid ? "valid" : "invalid"
    });
  }

  async function saveCredential() {
    setState({
      message: `Binding ${selectedProfile.name} credential to the default workspace.`,
      providerAccountId: draft.providerAccountId,
      status: "saving"
    });

    const response = await fetch(`${apiBaseUrl}/credentials`, {
      body: JSON.stringify({
        ...draft,
        provider: selectedProvider,
        workspaceId: defaultWorkspaceId
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setState({
        message:
          payload.message ??
          `${selectedProfile.name} credential could not be saved with the current values.`,
        providerAccountId: draft.providerAccountId,
        status: "invalid"
      });
      return;
    }

    const payload = (await response.json()) as CredentialMetadata;
    await loadCredentials();
    setDraft((current) => ({
      ...current,
      rawSecret: ""
    }));
    setState({
      message: `${payload.label} is now bound and available for future sessions.`,
      providerAccountId: payload.providerAccountId,
      status: "saved"
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "1.5rem"
      }}
    >
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1rem"
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Connect a provider</h2>
            <p style={{ color: "#475467", lineHeight: 1.6, marginBottom: 0 }}>
              Choose the runtime you want to bind. Release 1 stays BYOK-only, but each
              credential is validated before it can be reused in chat.
            </p>
          </div>
          <div
            style={{
              alignSelf: "flex-start",
              background: "#101828",
              borderRadius: "999px",
              color: "#f8fafc",
              fontSize: "0.85rem",
              fontWeight: 700,
              padding: "0.6rem 0.9rem"
            }}
          >
            Workspace: {defaultWorkspaceId}
          </div>
        </div>
        <ProviderSelector
          onSelect={selectProvider}
          providers={providerCatalog}
          selectedProvider={selectedProvider}
        />
      </section>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.9fr)"
        }}
      >
        <div
          style={{
            background: "rgba(248, 250, 252, 0.84)",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            borderRadius: "24px",
            padding: "1.25rem"
          }}
        >
          <h3 style={{ marginTop: 0 }}>{selectedProfile.name} binding details</h3>
          <CredentialForm
            canSave={canSave}
            draft={draft}
            isBusy={isBusy}
            onChange={updateDraft}
            onSave={saveCredential}
            onValidate={validateCredential}
            provider={selectedProfile}
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: "1rem"
          }}
        >
          <ValidationState
            message={state.message}
            providerAccountId={state.providerAccountId}
            status={state.status}
          />
          <section
            style={{
              background: "rgba(248, 250, 252, 0.84)",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              borderRadius: "24px",
              padding: "1.25rem"
            }}
          >
            <h3 style={{ marginTop: 0 }}>Bound credentials</h3>
            {savedCredentials.length === 0 ? (
              <p style={{ color: "#475467", lineHeight: 1.6, marginBottom: 0 }}>
                Nothing has been saved in the default workspace yet.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "0.75rem"
                }}
              >
                {savedCredentials.map((credential) => (
                  <div
                    key={credential.id}
                    style={{
                      background: "#ffffff",
                      border: "1px solid rgba(15, 23, 42, 0.08)",
                      borderRadius: "16px",
                      padding: "0.9rem 1rem"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "0.3rem"
                      }}
                    >
                      <strong>{credential.label}</strong>
                      <span style={{ color: "#667085", fontSize: "0.9rem" }}>
                        {credential.provider}
                      </span>
                    </div>
                    <div style={{ color: "#475467", fontSize: "0.92rem" }}>
                      {credential.providerAccountId} · {credential.validationState}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
