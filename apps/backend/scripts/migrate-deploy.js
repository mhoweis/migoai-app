#!/usr/bin/env node
/**
 * Runs `prisma migrate deploy`, first reconciling migrations whose objects
 * already exist in the database without being recorded in _prisma_migrations.
 *
 * The production database got the phase0 and places tables before those
 * migrations were tracked (e.g. via `prisma db push`), so `migrate deploy`
 * fails with "relation already exists". For the migrations listed below
 * only: if every table and index the migration creates is already present,
 * it is marked as applied; if none are, it is left for `migrate deploy`;
 * a partial match aborts so a human can look.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const PRE_EXISTING_MIGRATIONS = [
  '20260918120000_phase0_ai_governance',
  '20260919100000_places_discovery',
];

const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');

const runPrisma = (...args) => {
  execFileSync('npx', ['prisma', ...args], { stdio: 'inherit' });
};

const createdObjects = (migrationName) => {
  const sql = fs.readFileSync(path.join(migrationsDir, migrationName, 'migration.sql'), 'utf8');
  const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]);
  const indexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map((m) => m[1]);
  return [...tables, ...indexes];
};

async function reconcile() {
  const url = process.env.DIRECT_URL || process.env.SUPABASE_DATABASE_URL;
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const hasTable = await db.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS ok`;
    if (!hasTable[0].ok) return;

    const rows = await db.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;

    for (const name of PRE_EXISTING_MIGRATIONS) {
      const records = rows.filter((r) => r.migration_name === name);
      if (records.some((r) => r.finished_at && !r.rolled_back_at)) continue;
      const failed = records.some((r) => !r.finished_at && !r.rolled_back_at);

      const objects = createdObjects(name);
      const present = [];
      for (const obj of objects) {
        const res = await db.$queryRawUnsafe(
          'SELECT to_regclass($1) IS NOT NULL AS ok',
          `public."${obj}"`,
        );
        if (res[0].ok) present.push(obj);
      }

      if (present.length === objects.length) {
        console.log(`[migrate] ${name}: all objects already exist — marking as applied`);
        runPrisma('migrate', 'resolve', '--applied', name);
      } else if (present.length === 0) {
        if (failed) {
          console.log(`[migrate] ${name}: earlier attempt failed and nothing exists — marking rolled back for retry`);
          runPrisma('migrate', 'resolve', '--rolled-back', name);
        }
      } else {
        const missing = objects.filter((o) => !present.includes(o));
        throw new Error(
          `${name} is only partly present in the database (missing: ${missing.join(', ')}). ` +
          'Resolve it manually before deploying.',
        );
      }
    }
  } finally {
    await db.$disconnect();
  }
}

reconcile()
  .then(() => runPrisma('migrate', 'deploy'))
  .catch((err) => {
    console.error(`[migrate] ${err.message || err}`);
    process.exit(1);
  });
