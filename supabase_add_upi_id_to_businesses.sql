-- ==============================================================================
-- SEYALPRO: STORE SETTLEMENT UPI ID MIGRATION
-- Adds upi_id to public.businesses for payment collection & tracking
-- ==============================================================================

-- 1. Add upi_id column to businesses table if not exists
ALTER TABLE public.businesses 
    ADD COLUMN IF NOT EXISTS upi_id TEXT DEFAULT '';

-- 2. Optional: Seed default value if desired
COMMENT ON COLUMN public.businesses.upi_id IS 'Store official UPI ID for payment collection, settlement tracking, and WhatsApp dispatch slips';
