import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from '@neondatabase/serverless';

// Next.js HMR caches
let databaseInstance = globalThis._authDatabaseInstance || null;

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

export function getAuthDatabase() {
  if (databaseInstance || !getDatabaseUrl()) {
    return databaseInstance;
  }

  databaseInstance = {
    db: new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: getDatabaseUrl(),
        }),
      }),
    }),
    type: 'postgres',
  };

  globalThis._authDatabaseInstance = databaseInstance;

  return databaseInstance;
}
