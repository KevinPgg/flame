-- Phase 10-1 follow-up: add lookup indexes and tighten the INSERT RLS policy
-- on event_assignments.
--
-- 1. Indexes
--    The original migration only created partial UNIQUE indexes on
--    (event_id, user_id) and (event_id, cohost_organization_id).
--    Queries that filter by a single column (useAssignedEvents filters by
--    user_id alone; cohost query filters by cohost_organization_id alone;
--    RLS/delete queries filter by organization_id) cannot use those
--    multi-column indexes efficiently.
--
-- 2. INSERT policy
--    The original "Admins can create event assignments" policy only checked
--    that organization_id belongs to the caller's admin orgs. It did not
--    verify that the event being assigned actually belongs to that org. An
--    admin could therefore create a phantom assignment where organization_id
--    is their org but event_id belongs to a different org. The updated policy
--    adds an EXISTS sub-select to enforce that the event is owned by the
--    assigning organization.

--------------------------------------------------------------------------------
-- 1. Add non-unique lookup indexes
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS event_assignments_user_id_idx
  ON public.event_assignments(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_assignments_cohost_organization_id_idx
  ON public.event_assignments(cohost_organization_id)
  WHERE cohost_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_assignments_organization_id_idx
  ON public.event_assignments(organization_id);

--------------------------------------------------------------------------------
-- 2. Tighten INSERT policy: event must belong to the assigning org
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can create event assignments" ON public.event_assignments;

CREATE POLICY "Admins can create event assignments"
ON public.event_assignments
FOR INSERT
WITH CHECK (
  organization_id IN (SELECT get_admin_organizations())
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id
      AND e.organization_id = organization_id
  )
);
