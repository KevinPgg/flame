-- Migration: Add CHECK constraint to prevent oversubscription of promotional codes
-- Description: Ensures usage_count can never exceed usage_limit at the database level

-- Add table-level CHECK constraint to ensure usage_count <= usage_limit
ALTER TABLE public.promotional_codes
ADD CONSTRAINT usage_not_exceed_limit CHECK (usage_count <= usage_limit);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT usage_not_exceed_limit ON public.promotional_codes IS 
'Ensures promotional code usage_count cannot exceed usage_limit, preventing oversubscription at the database level';

