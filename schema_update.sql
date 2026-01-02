-- Run this in your Supabase SQL Editor to add the missing column

ALTER TABLE glass_logs 
ADD COLUMN broken_reasons text[];

-- Optional: Add a comment
COMMENT ON COLUMN glass_logs.broken_reasons IS 'Array of reasons for each broken glass incident';
