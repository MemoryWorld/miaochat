"use client";

import { useEffect, useState } from "react";

import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import {
  CredentialModeToggle,
  type CredentialMode
} from "./credential-mode-toggle";
import { CredentialForm, type CredentialDraft } from "./credential-form";
import {
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

type CredentialModeEntry = {
  credentialSource: CredentialMode;
  provider: SetupProvider;
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
  const { activeWorkspaceId } = useActiveWorkspace();
  const [selectedProvider, setSelectedProvider] = useState<SetupProvider>("codex");
  const [selectedMode, setSelectedMode] = useState<CredentialMode>("user_provided");
  const [draft, setDraft] = useState<CredentialDraft>(initialDraft);
  const [savedModes, setSavedModes] = useState<
    Partial<Record<SetupProvider, CredentialMode>>
  >({});
  const [savedCredentials, setSavedCredentials] = useState<CredentialMetadata[]>([]);
  const [state, setState] = useState<ValidationSnapshot>({
    status: "idle"
  });

  const selectedProfile = getProviderById(selectedProvider);
  const activeSavedMode = savedModes[selectedProvider] ?? "user_provided";
  const isBusy = state.status === "saving" || state.status === "validating";
  const canSave =
    state.status === "valid" &&
    draft.label.trim().length > 0 &&
    draft.providerAccountId.trim().length > 0 &&
    draft.rawSecret.trim().length > 0;
  const shouldShowByokRestore =
    selectedMode === "user_provided" && activeSavedMode === "platform_managed";
  const shouldShowPlatformManagedCard = selectedMode === "platform_managed";

  useEffect(() => {
    void loadSetupState();
  }, [activeWorkspaceId]);

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
    setSelectedMode(resolveSelectedMode(provider, savedModes));
    setState({
      status: "idle"
    });
  }

  async function loadSetupState() {
    await loadModes();
    await loadCredentials();
  }

  async function loadModes() {
    const response = await fetch(
      `${apiBaseUrl}/credentials/modes?workspaceId=${activeWorkspaceId}`,
      {
        credentials: "include"
      }
    );
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as CredentialModeEntry[];
    const nextModes = payload.reduce<Partial<Record<SetupProvider, CredentialMode>>>(
      (modes, entry) => {
        modes[entry.provider] = entry.credentialSource;
        return modes;
      },
      {}
    );
    setSavedModes(nextModes);
    setSelectedMode(resolveSelectedMode(selectedProvider, nextModes));
  }

  async function loadCredentials() {
    const response = await fetch(
      `${apiBaseUrl}/credentials?workspaceId=${activeWorkspaceId}`,
      {
        credentials: "include"
      }
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
        workspaceId: activeWorkspaceId
      }),
      credentials: "include",
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
        workspaceId: activeWorkspaceId
      }),
      credentials: "include",
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

  async function saveCredentialMode() {
    const action =
      selectedMode === "platform_managed"
        ? "Enable platform-managed mode"
        : "Restore BYOK mode";

    setState({
      message: `${action} for ${selectedProfile.name} in ${activeWorkspaceId}.`,
      status: "saving"
    });

    const response = await fetch(`${apiBaseUrl}/credentials/modes`, {
      body: JSON.stringify({
        credentialSource: selectedMode,
        provider: selectedProvider,
        workspaceId: activeWorkspaceId
      }),
      credentials: "include",
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
          `${selectedProfile.name} could not switch to the requested credential mode.`,
        status: "invalid"
      });
      return;
    }

    const payload = (await response.json()) as CredentialModeEntry;
    setSavedModes((current) => {
      const next = { ...current };
      if (payload.credentialSource === "user_provided") {
        delete next[selectedProvider];
      } else {
        next[selectedProvider] = payload.credentialSource;
      }
      return next;
    });
    setSelectedMode(payload.credentialSource);
    setState({
      message:
        payload.credentialSource === "platform_managed"
          ? "Platform-managed mode enabled"
          : "BYOK mode restored",
      status: "saved"
    });
  }

  return (
    <div className="grid gap-6">
      <section>
        <div className="mb-4 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">Connect a provider</h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              Choose the runtime you want to bind. Release 1 stays BYOK-only, but each
              credential is validated before it can be reused in chat.
            </p>
          </div>
          <Badge className="self-start" tone="default">
            Workspace: {activeWorkspaceId}
          </Badge>
        </div>
        <ProviderSelector
          onSelect={selectProvider}
          providers={providerCatalog}
          selectedProvider={selectedProvider}
        />
      </section>

      <CredentialModeToggle mode={selectedMode} onChange={setSelectedMode} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
        <div className="rounded-[28px] border border-white/70 bg-slate-50/80 p-5 shadow-sm">
          <h3 className="mt-0 text-xl font-semibold text-slate-950">
            {selectedProfile.name} binding details
          </h3>
          {shouldShowPlatformManagedCard ? (
            <section className="grid gap-4">
              <p className="m-0 text-sm leading-7 text-slate-600">
                Use the shared platform-managed pool for {selectedProfile.name} inside this
                workspace. No user secret is stored in the browser or in the workspace.
              </p>
              <Button
                className="justify-self-start"
                disabled={isBusy || activeSavedMode === "platform_managed"}
                onClick={saveCredentialMode}
                type="button"
              >
                {activeSavedMode === "platform_managed"
                  ? "Platform-managed mode active"
                  : "Enable platform-managed mode"}
              </Button>
            </section>
          ) : (
            <div className="grid gap-4">
              {shouldShowByokRestore ? (
                <div className="grid gap-3 rounded-3xl border border-sky-200 bg-sky-50/80 p-4">
                  <p className="m-0 text-sm leading-7 text-slate-900">
                    This provider is currently using the platform-managed pool. Switch back
                    to BYOK before binding a workspace-specific secret.
                  </p>
                  <Button
                    className="justify-self-start"
                    disabled={isBusy}
                    onClick={saveCredentialMode}
                    type="button"
                  >
                    Switch back to BYOK
                  </Button>
                </div>
              ) : null}
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
          )}
        </div>

        <div className="grid gap-4">
          <ValidationState
            message={state.message}
            providerAccountId={state.providerAccountId}
            status={state.status}
          />
          <section className="rounded-[28px] border border-white/70 bg-slate-50/80 p-5 shadow-sm">
            <h3 className="mt-0 text-xl font-semibold text-slate-950">Bound credentials</h3>
            {savedCredentials.length === 0 ? (
              <p className="mb-0 text-sm leading-7 text-slate-600">
                Nothing has been saved in the default workspace yet.
              </p>
            ) : (
              <div className="grid gap-3">
                {savedCredentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="mb-1 flex justify-between gap-3">
                      <strong>{credential.label}</strong>
                      <span className="text-sm text-slate-500">{credential.provider}</span>
                    </div>
                    <div className="text-sm text-slate-600">
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

function resolveSelectedMode(
  provider: SetupProvider,
  savedModes: Partial<Record<SetupProvider, CredentialMode>>
): CredentialMode {
  return savedModes[provider] ?? "user_provided";
}
