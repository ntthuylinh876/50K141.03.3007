'use strict';

// The database is provisioned in Supabase already. The historical files in
// db/migrations are SQL Server scripts; refusing here prevents accidental DDL.
console.error('[MIGRATE] Disabled: db/migrations contains SQL Server scripts. No Supabase schema or data was changed.');
console.error('[MIGRATE] The existing Supabase schema is db/schema.sql; review any PostgreSQL DDL manually before running it.');
process.exitCode = 1;
