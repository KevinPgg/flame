import * as Sentry from "@sentry/nextjs";
import { scrubSensitiveDataForSentry } from "./app/lib/utils/sentry-before-send-scrub";
import { SENTRY_REPLAY_CONFIG } from "./app/lib/utils/sentry-replay-config";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Session Replay with privacy settings from SENTRY_REPLAY_CONFIG
  integrations: [
    Sentry.replayIntegration(SENTRY_REPLAY_CONFIG),
  ],

  // Capture user info for debugging - scrub PII before sending
  beforeSend(event) {
    if (event.extra) {
      event.extra = scrubSensitiveDataForSentry(event.extra);
    }
    if (event.request && event.request.data) {
      event.request.data = scrubSensitiveDataForSentry(event.request.data);
    }
    if (event.tags) {
      event.tags = scrubSensitiveDataForSentry(event.tags);
    }
    // Note: event.user is not scrubbed - Sentry needs user.id/email for tracking
    // If strict PII is required, uncomment:
    // if (event.user?.email) event.user.email = "[REDACTED]";

    return event;
  },
});
