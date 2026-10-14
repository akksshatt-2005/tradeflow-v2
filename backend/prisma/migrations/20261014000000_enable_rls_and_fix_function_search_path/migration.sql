-- Fix Supabase Security Linter Errors & Warnings

-- 1. Enable Row Level Security (RLS) on public tables exposed to PostgREST
ALTER TABLE IF EXISTS "purchase_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "purchase_return_items" ENABLE ROW LEVEL SECURITY;

-- 2. Secure function search path to prevent mutable search_path injection
CREATE OR REPLACE FUNCTION public.prevent_stock_ledger_mutation()
RETURNS TRIGGER
SET search_path = public, pg_temp
LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('app.allow_ledger_cleanup', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'stock_ledger is an append-only audit ledger: UPDATE and DELETE operations are strictly prohibited.';
END;
$$;
