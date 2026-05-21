import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { toolBindingSchema, workspaceIdSchema, type ToolBinding } from "@agenthub/contracts";
import {
  ToolLoader,
  ToolRegistry,
  type LoadedToolDefinition,
  type RegisterServerToolInput,
  type ToolLoaderOptions
} from "@agenthub/tool-runtime";
import { z } from "zod";

import { DatabaseService } from "../database/database.service.js";

const agentLookupSchema = z.object({
  agentId: z.string().trim().min(1),
  workspaceId: workspaceIdSchema
});

type CustomAgentToolBindingsRow = {
  tool_bindings: ToolBinding[];
};

@Injectable()
export class ToolRegistrationService {
  private readonly loader: ToolLoader;
  private readonly registry = new ToolRegistry();

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    this.loader = new ToolLoader(this.registry);
  }

  registerServerTool(input: RegisterServerToolInput) {
    return this.registry.register(input);
  }

  listServerTools() {
    return this.registry.list();
  }

  async resolveAgentTools(
    agentId: string,
    workspaceId: string,
    options: ToolLoaderOptions = {}
  ): Promise<LoadedToolDefinition[]> {
    const parsed = agentLookupSchema.parse({
      agentId,
      workspaceId
    });
    const result = await this.database.query<CustomAgentToolBindingsRow>(
      `
        SELECT tool_bindings
        FROM custom_agents
        WHERE id = $1 AND workspace_id = $2
      `,
      [parsed.agentId, parsed.workspaceId]
    );
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException(
        `Custom agent ${parsed.agentId} was not found in workspace ${parsed.workspaceId}`
      );
    }

    const bindings = z.array(toolBindingSchema).parse(row.tool_bindings ?? []);

    return this.loader.loadMany(bindings, options);
  }
}
