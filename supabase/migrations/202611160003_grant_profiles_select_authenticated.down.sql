-- No-op down migration: revoking SELECT on profiles from authenticated could break RLS self-reads.
SELECT 1;

