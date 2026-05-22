"use client";

import { useState } from "react";

import type { Artifact } from "@agenthub/contracts";

export type DiffHunk = {
  after: string;
  before: string;
  id: string;
};

type DiffCardProps = {
  artifact: Artifact;
  hunks?: DiffHunk[];
  onApplyHunk?: (hunkId: string) => void;
  onRejectHunk?: (hunkId: string) => void;
};

export function DiffCard({
  artifact,
  hunks = [],
  onApplyHunk,
  onRejectHunk
}: DiffCardProps) {
  const [decisions, setDecisions] = useState<Record<string, "applied" | "rejected">>({});

  function handleApply(hunkId: string): void {
    setDecisions((current) => ({ ...current, [hunkId]: "applied" }));
    onApplyHunk?.(hunkId);
  }

  function handleReject(hunkId: string): void {
    setDecisions((current) => ({ ...current, [hunkId]: "rejected" }));
    onRejectHunk?.(hunkId);
  }

  return (
    <article
      aria-label={`Diff artifact ${artifact.title}`}
      data-artifact-card="diff"
      data-artifact-kind={artifact.kind}
    >
      <header>
        <span data-testid="diff-card-kind">Diff</span>
        <strong>{artifact.title}</strong>
      </header>
      {hunks.length === 0 ? (
        <p>Baseline diff card: open the artifact preview to inspect the change.</p>
      ) : (
        <ul data-testid="diff-card-hunks">
          {hunks.map((hunk) => (
            <li key={hunk.id} data-hunk-id={hunk.id} data-decision={decisions[hunk.id]}>
              <pre data-testid={`hunk-${hunk.id}-before`}>{`- ${hunk.before}`}</pre>
              <pre data-testid={`hunk-${hunk.id}-after`}>{`+ ${hunk.after}`}</pre>
              <button type="button" onClick={() => handleApply(hunk.id)}>
                Apply
              </button>
              <button type="button" onClick={() => handleReject(hunk.id)}>
                Reject
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
