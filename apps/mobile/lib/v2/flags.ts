/**
 * Flame 2.0 organizer in the app (fase 1b) is on by default. `EXPO_PUBLIC_ORGANIZER_V1=true`
 * (apps/mobile/.env, restart Metro) brings back the v1 organizer screens — emergency switch,
 * same idea as ORGANIZER_V1 on the web. Read statically so Expo inlines it at build time.
 */
export function organizerV2Enabled(): boolean {
  return process.env.EXPO_PUBLIC_ORGANIZER_V1 !== "true";
}

/**
 * Flame 2.0 attendee side (fase 2): on by default; `EXPO_PUBLIC_ATTENDEE_V1=true` brings back the
 * v1 header, tab bar and attendee screens (same emergency switch idea).
 */
export function attendeeV2Enabled(): boolean {
  return process.env.EXPO_PUBLIC_ATTENDEE_V1 !== "true";
}
