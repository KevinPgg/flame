-- Migration: Rename promotional codes policy to reflect authenticated-only access
-- Description: The policy name "Anyone can view..." is misleading since it requires authentication

-- Rename the policy to clarify it's for authenticated users only
ALTER POLICY "Anyone can view promotional codes for published events"
ON public.promotional_codes
RENAME TO "Authenticated users can view promotional codes for published events";

-- Update comment to match the corrected policy name
COMMENT ON POLICY "Authenticated users can view promotional codes for published events"
ON public.promotional_codes IS
'Allows authenticated users to view promotional codes for published events during purchase validation';

