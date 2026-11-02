-- Flame 2.0 · fase 4.5 Invitaciones de equipo (decisiones de Kevin 2026-11-02).
--
-- Owners / admins invite any e-mail (with or without a Flame account) as admin or organizer.
-- The person sees "Invited" until they accept: in the app (bell + "You") and by e-mail (link
-- /invite/<token>). Invitations expire after 7 days; they can be re-sent (new expiry) or
-- cancelled. Accepting creates the organization_members row with the invited role.
-- Members added before this keep working as they are. Everything goes through the API
-- (service role): RLS is on with no policies, so clients can't read tokens or e-mails.

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  role text NOT NULL CHECK (role IN ('admin', 'organizer')),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  invited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  responded_at timestamptz
);

-- One open invitation per person and organization (re-sending updates it).
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_one_pending
  ON public.organization_invitations (organization_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS organization_invitations_email_idx ON public.organization_invitations (email) WHERE status = 'pending';

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.organization_invitations IS
  'Team invitations (Flame 2.0 fase 4.5). Managed via /api/organizations/[id]/invitations, /api/me/invitations and /api/invitations/[token].';
