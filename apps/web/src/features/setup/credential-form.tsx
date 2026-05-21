"use client";

import type { ProviderCatalogEntry } from "./provider-catalog";

export type CredentialDraft = {
  label: string;
  providerAccountId: string;
  rawSecret: string;
};

type CredentialFormProps = {
  canSave: boolean;
  draft: CredentialDraft;
  isBusy: boolean;
  onChange: (field: keyof CredentialDraft, value: string) => void;
  onSave: () => void;
  onValidate: () => void;
  provider: ProviderCatalogEntry;
};

export function CredentialForm({
  canSave,
  draft,
  isBusy,
  onChange,
  onSave,
  onValidate,
  provider
}: CredentialFormProps) {
  return (
    <section
      style={{
        display: "grid",
        gap: "1rem"
      }}
    >
      <div
        style={{
          display: "grid",
          gap: "0.35rem"
        }}
      >
        <label htmlFor="credential-label">Credential label</label>
        <input
          id="credential-label"
          onChange={(event) => onChange("label", event.target.value)}
          placeholder={provider.labelHint}
          style={inputStyle}
          value={draft.label}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: "0.35rem"
        }}
      >
        <label htmlFor="provider-account-id">Provider account identifier</label>
        <input
          id="provider-account-id"
          onChange={(event) => onChange("providerAccountId", event.target.value)}
          placeholder="acct_main"
          style={inputStyle}
          value={draft.providerAccountId}
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: "0.35rem"
        }}
      >
        <label htmlFor="provider-secret">Provider secret</label>
        <textarea
          id="provider-secret"
          onChange={(event) => onChange("rawSecret", event.target.value)}
          placeholder={provider.secretHint}
          rows={5}
          style={{
            ...inputStyle,
            fontFamily: "\"IBM Plex Mono\", monospace",
            resize: "vertical"
          }}
          value={draft.rawSecret}
        />
        <span style={{ color: "#667085", fontSize: "0.9rem" }}>{provider.secretHint}</span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem"
        }}
      >
        <button
          disabled={isBusy}
          onClick={onValidate}
          style={secondaryButtonStyle}
          type="button"
        >
          Validate credential
        </button>
        <button
          disabled={!canSave || isBusy}
          onClick={onSave}
          style={primaryButtonStyle(!canSave || isBusy)}
          type="button"
        >
          Save and bind
        </button>
      </div>
    </section>
  );
}

const inputStyle = {
  background: "#ffffff",
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: "14px",
  color: "#101828",
  font: "inherit",
  padding: "0.875rem 1rem"
} as const;

const secondaryButtonStyle = {
  background: "#f8fafc",
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: "999px",
  color: "#101828",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.8rem 1.1rem"
} as const;

function primaryButtonStyle(disabled: boolean) {
  return {
    background: disabled ? "#98a2b3" : "#101828",
    border: "1px solid transparent",
    borderRadius: "999px",
    color: "#f8fafc",
    cursor: disabled ? "not-allowed" : "pointer",
    font: "inherit",
    fontWeight: 700,
    padding: "0.8rem 1.1rem"
  } as const;
}
