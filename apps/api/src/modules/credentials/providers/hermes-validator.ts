import type { CreateProviderCredentialInput } from "@agenthub/contracts";
import type { CredentialValidationResult } from "@agenthub/domain";

import { validateByPrefix } from "./shared.js";

export async function validateHermesCredential(
  input: CreateProviderCredentialInput
): Promise<CredentialValidationResult> {
  return validateByPrefix(input, "Hermes", ["hermes_"]);
}
