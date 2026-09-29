-- ==============================================================================
-- SEYALPRO: STORE BRANDING, LOGO, SIGNATURE & OFFICIAL ADDRESS MIGRATION
-- ==============================================================================

-- Add signature_url, address, phone, and gstin columns to businesses table if not exists
ALTER TABLE public.businesses 
    ADD COLUMN IF NOT EXISTS signature_url TEXT DEFAULT '/default-signature.svg',
    ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '255, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130',
    ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '+91 98765 43210',
    ADD COLUMN IF NOT EXISTS gstin TEXT DEFAULT '';

-- Ensure logo_url default is set to dummy logo
ALTER TABLE public.businesses 
    ALTER COLUMN logo_url SET DEFAULT '/dummy-logo.svg';

-- Update existing default tenant with initial values if null
UPDATE public.businesses
SET 
    signature_url = COALESCE(signature_url, '/default-signature.svg'),
    address = COALESCE(address, '255, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130'),
    phone = COALESCE(phone, '+91 98765 43210'),
    logo_url = COALESCE(logo_url, '/dummy-logo.svg')
WHERE id = 'a0000000-0000-0000-0000-000000000001';
