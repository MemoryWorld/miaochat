"use client";

import { useState } from "react";

export type ConflictBranch = {
  authorUserId: string;
  contentDigest: string;
  label: string;
  preview: string;
};

type DiffConflictResolverProps = {
  branches: ConflictBranch[];
  onResolve: (selectedDigest: string) => void;
};

export function DiffConflictResolver({ branches, onResolve }: DiffConflictResolverProps) {
  const [selected, setSelected] = useState<string | null>(branches[0]?.contentDigest ?? null);

  return (
    <section data-testid="diff-conflict-resolver">
      <h3>Resolve concurrent edit</h3>
      <ul>
        {branches.map((branch) => (
          <li key={branch.contentDigest} data-branch-digest={branch.contentDigest}>
            <label>
              <input
                aria-label={`Select branch ${branch.label}`}
                type="radio"
                name="conflict-branch"
                checked={selected === branch.contentDigest}
                onChange={() => setSelected(branch.contentDigest)}
              />
              <strong>{branch.label}</strong> by <code>{branch.authorUserId}</code>
            </label>
            <pre>{branch.preview}</pre>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          if (selected) {
            onResolve(selected);
          }
        }}
      >
        Apply selected branch
      </button>
    </section>
  );
}
