import { z } from "zod";

export const resourcePolicySchema = z.object({
  cpuMs: z.number().int().positive().default(2000),
  maxOutputBytes: z.number().int().positive().default(1024 * 1024),
  memoryMb: z.number().int().positive().default(256),
  /**
   * When false, tools may not open outbound sockets. Tool implementations
   * receive the policy in their context and are expected to honour it.
   * The sandbox lane can additionally enforce it at the OS level on
   * platforms that ship `node:vm`-class isolation.
   */
  networkAllowed: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(15_000)
});

export type ResourcePolicy = z.infer<typeof resourcePolicySchema>;

export const DEFAULT_RESOURCE_POLICY: ResourcePolicy = resourcePolicySchema.parse({});

export function tierResourcePolicy(
  tier: "interactive" | "batch" | "trusted"
): ResourcePolicy {
  switch (tier) {
    case "trusted":
      return resourcePolicySchema.parse({
        cpuMs: 30_000,
        maxOutputBytes: 16 * 1024 * 1024,
        memoryMb: 1024,
        networkAllowed: true,
        timeoutMs: 120_000
      });
    case "batch":
      return resourcePolicySchema.parse({
        cpuMs: 10_000,
        maxOutputBytes: 4 * 1024 * 1024,
        memoryMb: 512,
        networkAllowed: false,
        timeoutMs: 60_000
      });
    case "interactive":
    default:
      return DEFAULT_RESOURCE_POLICY;
  }
}
