-- Allow users to delete (dismiss) their own notifications
CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (
  user_id IN (
    SELECT u.id FROM public.users u
    WHERE u.clerk_id::text = (auth.jwt() ->> 'sub'::text)
  )
);
