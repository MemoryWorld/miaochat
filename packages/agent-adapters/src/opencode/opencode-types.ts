export type OpenCodeServerLike = {
  close(): Promise<void> | void;
  url?: string;
};

export type OpenCodeClientLike = {
  auth: {
    set(options: unknown): Promise<unknown>;
  };
  session: {
    create(options?: unknown): Promise<unknown>;
    prompt(options: unknown): Promise<unknown>;
  };
};

export type OpenCodeRuntimeLike = {
  client: OpenCodeClientLike;
  server?: OpenCodeServerLike;
};

export type OpenCodeClientFactory = (
  options?: Record<string, unknown>
) => Promise<OpenCodeRuntimeLike>;
