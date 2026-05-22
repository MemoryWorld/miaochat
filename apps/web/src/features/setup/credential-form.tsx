"use client";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

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
    <section className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-sm font-semibold text-slate-700" htmlFor="credential-label">
          Credential label
        </label>
        <Input
          id="credential-label"
          onChange={(event) => onChange("label", event.target.value)}
          placeholder={provider.labelHint}
          value={draft.label}
        />
      </div>

      <div className="grid gap-2">
        <label
          className="text-sm font-semibold text-slate-700"
          htmlFor="provider-account-id"
        >
          Provider account identifier
        </label>
        <Input
          id="provider-account-id"
          onChange={(event) => onChange("providerAccountId", event.target.value)}
          placeholder="acct_main"
          value={draft.providerAccountId}
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-semibold text-slate-700" htmlFor="provider-secret">
          Provider secret
        </label>
        <Textarea
          className="min-h-32 resize-y font-mono"
          id="provider-secret"
          onChange={(event) => onChange("rawSecret", event.target.value)}
          placeholder={provider.secretHint}
          rows={5}
          value={draft.rawSecret}
        />
        <span className="text-sm text-slate-500">{provider.secretHint}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={isBusy}
          onClick={onValidate}
          type="button"
          variant="secondary"
        >
          Validate credential
        </Button>
        <Button
          disabled={!canSave || isBusy}
          onClick={onSave}
          type="button"
        >
          Save and bind
        </Button>
      </div>
    </section>
  );
}
