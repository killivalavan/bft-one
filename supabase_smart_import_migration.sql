-- ==============================================================================
-- SEYALPRO — SMART IMPORT (AI BUSINESS DATA MIGRATION) SCHEMA & RLS POLICIES
-- ==============================================================================
-- Non-destructive, idempotent migration establishing tenant-isolated tables for
-- Smart Import jobs, files, column mappings, staging records, validation errors,
-- audit logs, and provenance tracking on store tables.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. DATA IMPORT JOBS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_import_jobs (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_email TEXT,
    import_name TEXT NOT NULL,
    source_software TEXT DEFAULT 'excel_sheets',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'analyzing' | 'mapped' | 'validated' | 'importing' | 'completed' | 'partial' | 'failed' | 'rolled_back'
    duplicate_strategy TEXT NOT NULL DEFAULT 'skip', -- 'skip' | 'merge' | 'import_as_new'
    total_records INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    file_names JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    rolled_back_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_import_jobs_biz_created
    ON public.data_import_jobs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_import_jobs_biz_status
    ON public.data_import_jobs(business_id, status);

ALTER TABLE public.data_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_import_jobs_tenant_isolation" ON public.data_import_jobs;
CREATE POLICY "data_import_jobs_tenant_isolation" ON public.data_import_jobs
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 2. DATA IMPORT FILES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_import_files (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES public.data_import_jobs(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    file_type TEXT NOT NULL,
    sheet_count INTEGER NOT NULL DEFAULT 1,
    row_count INTEGER NOT NULL DEFAULT 0,
    detected_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_import_files_job
    ON public.data_import_files(business_id, job_id);

ALTER TABLE public.data_import_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_import_files_tenant_isolation" ON public.data_import_files;
CREATE POLICY "data_import_files_tenant_isolation" ON public.data_import_files
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 3. DATA IMPORT MAPPINGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_import_mappings (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES public.data_import_jobs(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    sheet_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_import_mappings_job
    ON public.data_import_mappings(business_id, job_id);

ALTER TABLE public.data_import_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_import_mappings_tenant_isolation" ON public.data_import_mappings;
CREATE POLICY "data_import_mappings_tenant_isolation" ON public.data_import_mappings
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 4. DATA IMPORT STAGING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_import_staging (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES public.data_import_jobs(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    source_file TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    source_fingerprint TEXT NOT NULL,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_status TEXT NOT NULL DEFAULT 'valid', -- 'valid' | 'warning' | 'invalid'
    duplicate_status TEXT NOT NULL DEFAULT 'unique', -- 'unique' | 'file_duplicate' | 'existing_duplicate'
    action TEXT NOT NULL DEFAULT 'import', -- 'import' | 'skip' | 'merge'
    target_record_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_import_staging_job
    ON public.data_import_staging(business_id, job_id);
CREATE INDEX IF NOT EXISTS idx_data_import_staging_fingerprint
    ON public.data_import_staging(business_id, source_fingerprint);

ALTER TABLE public.data_import_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_import_staging_tenant_isolation" ON public.data_import_staging;
CREATE POLICY "data_import_staging_tenant_isolation" ON public.data_import_staging
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 5. DATA IMPORT ERRORS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_import_errors (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES public.data_import_jobs(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    source_file TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    entity_type TEXT,
    field_name TEXT,
    error_code TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'error', -- 'error' | 'warning'
    message TEXT NOT NULL,
    original_value TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_import_errors_job
    ON public.data_import_errors(business_id, job_id);

ALTER TABLE public.data_import_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_import_errors_tenant_isolation" ON public.data_import_errors;
CREATE POLICY "data_import_errors_tenant_isolation" ON public.data_import_errors
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 6. DATA IMPORT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_import_logs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES public.data_import_jobs(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    event_type TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_import_logs_job
    ON public.data_import_logs(business_id, job_id, created_at DESC);

ALTER TABLE public.data_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_import_logs_tenant_isolation" ON public.data_import_logs;
CREATE POLICY "data_import_logs_tenant_isolation" ON public.data_import_logs
FOR ALL TO authenticated
USING (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
)
WITH CHECK (
    public.is_super_admin() OR
    business_id = public.get_current_business_id()
);

-- ------------------------------------------------------------------------------
-- 7. OPTIONAL PROVENANCE COLUMNS ON STORE TABLES (NON-DESTRUCTIVE)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.invoices
    ADD COLUMN IF NOT EXISTS import_job_id TEXT,
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;

ALTER TABLE IF EXISTS public.b2b_dispatches
    ADD COLUMN IF NOT EXISTS import_job_id TEXT,
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;

ALTER TABLE IF EXISTS public.b2b_products
    ADD COLUMN IF NOT EXISTS import_job_id TEXT,
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS has_verified_cost BOOLEAN DEFAULT true;

ALTER TABLE IF EXISTS public.b2b_clients
    ADD COLUMN IF NOT EXISTS import_job_id TEXT,
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;

ALTER TABLE IF EXISTS public.b2b_payments
    ADD COLUMN IF NOT EXISTS import_job_id TEXT,
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;

ALTER TABLE IF EXISTS public.b2b_expenses
    ADD COLUMN IF NOT EXISTS import_job_id TEXT,
    ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;

COMMIT;

