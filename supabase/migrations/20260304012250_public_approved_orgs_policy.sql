-- Allow public read access to approved organizations.
-- Required for ExploreOrganizers on home screen and organizer pages
-- where the viewer may not be a member of the organization.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'organizations'
        AND policyname = 'Anyone can view approved organizations'
    ) THEN
        CREATE POLICY "Anyone can view approved organizations" ON organizations
        FOR SELECT
        TO public
        USING (approved = true);
    END IF;
END $$;
