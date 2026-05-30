import {
  buildBuiltInCodingAgentInput,
  buildCodingKickoffMessage,
  builtInCodingProfiles,
  builtInCodingTeammateTag,
  getBuiltInCodingProfileByRole,
  type BuiltInCodingProfile,
  type BuiltInCodingRole
} from "@agenthub/contracts";
import type { CustomAgent } from "@agenthub/contracts";

export type BuiltInCodingTeammateTemplate = BuiltInCodingProfile;

export const builtInCodingTeamTemplates = [...builtInCodingProfiles];

export {
  buildBuiltInCodingAgentInput,
  buildCodingKickoffMessage,
  builtInCodingTeammateTag
};

export type { BuiltInCodingRole };

export function getBuiltInCodingTeammateByRole(role: BuiltInCodingRole) {
  return getBuiltInCodingProfileByRole(role);
}

export function isBuiltInCodingTeammate(
  agent: Pick<CustomAgent, "capabilityTags" | "name">
): boolean {
  return agent.capabilityTags.includes(builtInCodingTeammateTag);
}
