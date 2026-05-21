import type { CreateProviderCredentialInput } from "@agenthub/contracts";
import type { CredentialValidationResult } from "@agenthub/domain";

import { validateByPrefix } from "./shared.js";

export async function validateOpenClawCredential(
  input: CreateProviderCredentialInput
): Promise<CredentialValidationResult> {
  return validateByPrefix(input, "OpenClaw", ["openclaw_"]);
}
