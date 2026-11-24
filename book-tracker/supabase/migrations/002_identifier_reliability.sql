-- Additive schema columns for GS1 EAN-13 identifiers (e.g. Vietnamese 893* barcodes)
-- and explicit publisher vs distributor attribution.

ALTER TABLE IF EXISTS public.editions
  ADD COLUMN IF NOT EXISTS distributor TEXT;

ALTER TABLE IF EXISTS public.edition_isbns
  ADD COLUMN IF NOT EXISTS ean13 TEXT,
  ADD COLUMN IF NOT EXISTS identifier_type TEXT CHECK (identifier_type IN ('isbn13', 'isbn10', 'ean13'));

ALTER TABLE IF EXISTS public.metadata_records
  ADD COLUMN IF NOT EXISTS ean13 TEXT;

CREATE INDEX IF NOT EXISTS idx_edition_isbns_ean13 ON public.edition_isbns(ean13);
