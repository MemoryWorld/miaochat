import type { OrchestratorResult, OrchestratorTarget } from "./orchestrator-state.js";

export type HandoffDeclaration = {
  consumes: string[];
  produces: string[];
};

type HandoffTaggedTarget = Pick<OrchestratorTarget, "capabilityTags">;

const handoffTagPattern = /^(produces|consumes)\s*[:=：]\s*([a-z0-9._-]+)$/i;

export function readHandoffDeclaration(target: HandoffTaggedTarget): HandoffDeclaration {
  const declaration: HandoffDeclaration = {
    consumes: [],
    produces: []
  };

  for (const tag of target.capabilityTags ?? []) {
    const match = tag.trim().match(handoffTagPattern);

    if (!match) {
      continue;
    }

    const [, direction, artifactKind] = match;
    const normalizedKind = artifactKind?.toLowerCase();

    if (!normalizedKind) {
      continue;
    }

    if (direction?.toLowerCase() === "produces") {
      declaration.produces.push(normalizedKind);
    } else {
      declaration.consumes.push(normalizedKind);
    }
  }

  return {
    consumes: unique(declaration.consumes),
    produces: unique(declaration.produces)
  };
}

export function selectNextHandoffWave(input: {
  completedResults: OrchestratorResult[];
  remainingTargets: OrchestratorTarget[];
}): OrchestratorTarget[] {
  const producedArtifacts = new Set(
    input.completedResults.flatMap(
      (result) => readHandoffDeclaration(result).produces
    )
  );
  const futureArtifacts = new Set(
    input.remainingTargets.flatMap(
      (target) => readHandoffDeclaration(target).produces
    )
  );
  const readyTargets = input.remainingTargets.filter((target) => {
    const declaration = readHandoffDeclaration(target);

    return declaration.consumes.every(
      (artifactKind) =>
        producedArtifacts.has(artifactKind) || !futureArtifacts.has(artifactKind)
    );
  });

  return readyTargets.length > 0 ? readyTargets : [...input.remainingTargets];
}

export function hasProducedHandoff(result: OrchestratorResult): boolean {
  return readHandoffDeclaration(result).produces.length > 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
