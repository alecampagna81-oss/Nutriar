import pg from 'pg';
import { config } from './config.js';

// numeric -> number (los valores clínicos y nutricionales no superan la precisión de double)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// date -> 'YYYY-MM-DD' sin conversión de zona horaria
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

type Client = pg.Pool | pg.PoolClient;

export async function q<T = any>(sql: string, params: unknown[] = [], client: Client = pool): Promise<T[]> {
  const r = await client.query(sql, params as any[]);
  return r.rows as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = [], client: Client = pool): Promise<T | undefined> {
  const rows = await q<T>(sql, params, client);
  return rows[0];
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}
