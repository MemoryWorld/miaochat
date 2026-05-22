import type {
  CredentialSource,
  DeployTargetKind
} from "@agenthub/contracts";

export type PreparedDeployRecord = {
  artifactId: string;
  artifactStorageKey: string | null;
  artifactTitle: string;
  config: Record<string, unknown>;
  credentialSource: CredentialSource;
  deployTargetId: string;
  deploymentId: string;
  hasSecret: boolean;
  targetKind: DeployTargetKind;
  targetName: string;
  workspaceId: string;
};
