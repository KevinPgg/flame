-- Push Notifications: add push_tokens and notifications tables
-- push_tokens stores Expo push tokens per user (multi-device support)
-- notifications stores notification history for in-app display

-- =============================================================================
-- push_tokens table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  device_id text,
  platform text DEFAULT 'ios',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, expo_push_token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push tokens"
ON public.push_tokens FOR SELECT TO authenticated
USING (
  user_id IN (
    SELECT u.id FROM public.users u
    WHERE u.clerk_id::text = (auth.jwt() ->> 'sub'::text)
  )
);

CREATE POLICY "Users can insert their own push tokens"
ON public.push_tokens FOR INSERT TO authenticated
WITH CHECK (
  user_id IN (
    SELECT u.id FROM public.users u
    WHERE u.clerk_id::text = (auth.jwt() ->> 'sub'::text)
  )
);

CREATE POLICY "Users can delete their own push tokens"
ON public.push_tokens FOR DELETE TO authenticated
USING (
  user_id IN (
    SELECT u.id FROM public.users u
    WHERE u.clerk_id::text = (auth.jwt() ->> 'sub'::text)
  )
);

CREATE INDEX idx_push_tokens_user_id ON public.push_tokens(user_id);

-- =============================================================================
-- notifications table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (
  user_id IN (
    SELECT u.id FROM public.users u
    WHERE u.clerk_id::text = (auth.jwt() ->> 'sub'::text)
  )
);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (
  user_id IN (
    SELECT u.id FROM public.users u
    WHERE u.clerk_id::text = (auth.jwt() ->> 'sub'::text)
  )
)
WITH CHECK (
  user_id IN (
    SELECT u.id FROM public.users u
    WHERE u.clerk_id::text = (auth.jwt() ->> 'sub'::text)
  )
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- =============================================================================
-- notification_preferences column on users table
-- =============================================================================
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{
  "rsvp_pending": true,
  "rsvp_approved": true,
  "rsvp_rejected": true,
  "event_date_changed": true,
  "event_reminder": true,
  "new_rsvp_request": true,
  "ticket_sold": true,
  "auth_expiry_warning": true
}'::jsonb;

COMMENT ON COLUMN public.users.notification_preferences IS 'Per-type push notification opt-in/opt-out preferences. Each key is a notification type, value is boolean (true = enabled).';
