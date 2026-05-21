export type ConfigFileLoadedTool = {
  description: string;
  name: string;
  runtime: "config_file";
  source: {
    args: string[];
    command: string;
    kind: "config_file";
    path: string;
  };
};

export type RegisteredServerTool = {
  description: string;
  name: string;
  runtime: "server_registration";
  source: {
    handlerId: string;
    kind: "server_registration";
  };
};

export type LoadedToolDefinition = ConfigFileLoadedTool | RegisteredServerTool;

export type RegisterServerToolInput = {
  description: string;
  handlerId: string;
  name: string;
};

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredServerTool>();

  register(input: RegisterServerToolInput): RegisteredServerTool {
    if (this.tools.has(input.name)) {
      throw new Error(`Tool "${input.name}" is already registered.`);
    }

    const registered: RegisteredServerTool = {
      description: input.description,
      name: input.name,
      runtime: "server_registration",
      source: {
        handlerId: input.handlerId,
        kind: "server_registration"
      }
    };

    this.tools.set(input.name, registered);

    return registered;
  }

  get(name: string): RegisteredServerTool | null {
    return this.tools.get(name) ?? null;
  }

  list(): RegisteredServerTool[] {
    return [...this.tools.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }
}
