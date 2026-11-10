import { neonConfig, Pool } from "@neondatabase/serverless";
import WebSocket from "ws";

neonConfig.webSocketConstructor = WebSocket;

export type TransactionalSql = {
  (parts: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, any>[]>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
};

export async function beginTransaction(connectionString: string): Promise<TransactionalSql> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  let completed = false;
  try {
    await client.query("BEGIN");
  } catch (error) {
    client.release();
    await pool.end();
    throw error;
  }

  const sql = ((
    parts: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const text = parts.reduce(
      (query, part, index) => query + (index > 0 ? `$${index}` : "") + part,
      ""
    );
    return client.query(text, values).then((result) => result.rows);
  }) as TransactionalSql;

  sql.commit = async () => {
    await client.query("COMMIT");
    completed = true;
  };
  sql.rollback = async () => {
    if (!completed) {
      await client.query("ROLLBACK");
      completed = true;
    }
  };
  sql.close = async () => {
    client.release();
    await pool.end();
  };

  return sql;
}
