import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from '@neondatabase/serverless';

// Next.js HMR caches
let databaseInstance = globalThis._authDatabaseInstance || null;
let migrationPromise = globalThis._authMigrationPromise || null;

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
    
    globalThis._authMigrationPromise = migrationPromise;
  }

  await migrationPromise;
}
