ALTER TABLE events
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Guayaquil';

COMMENT ON COLUMN events.timezone IS 'IANA timezone identifier used for event date/time display.';
