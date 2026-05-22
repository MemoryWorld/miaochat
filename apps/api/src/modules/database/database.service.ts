import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { SQLWrapper } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow
} from "pg";

export type DatabaseExecutor = {
  execute<Row extends QueryResultRow = QueryResultRow>(
    query: SQLWrapper | string
  ): Promise<QueryResult<Row>>;
};

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:6432/agenthub",
    max: resolvePoolMax()
  });
  private readonly drizzleDb = drizzle(this.pool);

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = []
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  execute<Row extends QueryResultRow = QueryResultRow>(
    query: SQLWrapper | string
  ): Promise<QueryResult<Row>> {
    return this.drizzleDb.execute<Row>(query) as Promise<QueryResult<Row>>;
  }

  transaction<T>(callback: (tx: DatabaseExecutor) => Promise<T>): Promise<T> {
    return this.drizzleDb.transaction(async (tx) =>
      callback(tx as unknown as DatabaseExecutor)
    );
  }

  get db() {
    return this.drizzleDb;
  }

  async withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

function resolvePoolMax(): number {
  const configured = Number(process.env.PG_POOL_MAX);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return process.env.NODE_ENV === "test" ? 1 : 10;
}
