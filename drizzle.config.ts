import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit config — drives `drizzle-kit generate` (build a new
 * migration file from a schema diff) and `drizzle-kit push` (apply
 * the schema directly to a dev database without going through a
 * migration file).
 *
 * Production uses the generated `migrations/*.sql` files exclusively;
 * push-mode is only for local prototyping where re-running migrations
 * for every tweak would be tedious.
 */
export default {
  schema: './src/lib/server/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
} satisfies Config;
