import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from '@neondatabase/serverless';

let databaseInstance = null;
let migrationPromise = null;

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

  return databaseInstance;
}

export async function ensureAuthSchema(auth) {
  const database = getAuthDatabase();

  if (!database) {
    return;
  }

  if (!migrationPromise) {
    migrationPromise = import(new URL('../node_modules/better-auth/dist/db/get-migration.mjs', import.meta.url))
      .then(({ getMigrations }) => getMigrations({
        ...auth.options,
        database,
      }))
      .then(({ runMigrations }) => runMigrations());
  }

  await migrationPromise;
}
