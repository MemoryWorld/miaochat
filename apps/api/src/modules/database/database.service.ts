import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow
} from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub",
    max: resolvePoolMax()
  });

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = []
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
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
