ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(30),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100);

ALTER TABLE organizations
  ADD CONSTRAINT organizations_description_length_check
  CHECK (description IS NULL OR char_length(description) <= 500);

COMMENT ON COLUMN organizations.description IS 'Public profile description (max 500 chars enforced in app)';
COMMENT ON COLUMN organizations.instagram_handle IS 'Instagram username without @ prefix (max 30 chars per Instagram limit)';
COMMENT ON COLUMN organizations.city IS 'Primary city for the organization';
