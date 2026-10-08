/**
 * English — default language (Flame 2.0 ships in English, like the prototype).
 *
 * Rules:
 * - This file defines the KEYS. `es.ts` must have exactly the same shape (TypeScript enforces it).
 * - Use `{name}` placeholders for values. Use `{ one, other }` objects for plurals (needs `count`).
 * - Organizer-written content (event names, descriptions, form questions) is never translated.
 */
export const en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    continue: "Continue",
    back: "Back",
    close: "Close",
    done: "Done",
    edit: "Edit",
    delete: "Delete",
    share: "Share",
    search: "Search",
    seeAll: "See all",
    more: "More",
    less: "Less",
    retry: "Try again",
    loading: "Loading…",
    free: "Free",
    from: "From {price}",
    allCities: "All cities",
    confirmDelete: "Are you sure? This can’t be undone.",
  },
  tabs: {
    home: "Home",
    explore: "Explore",
    tickets: "Tickets",
    you: "You",
    events: "Events",
    rsvps: "RSVPs",
    scan: "Scan",
    team: "Team",
    settings: "Settings",
  },
  home: {
    emptyTitle: "Nothing in {city} yet",
    emptyBody: "No events here right now. Follow organizers in {city} and you’ll hear first.",
    showAllCities: "Show all cities",
  },
  event: {
    getTickets: "Get tickets",
    requestToJoin: "Request to join",
    pending: "Pending",
    viewTickets: "View tickets",
    soldOut: "Sold out",
    haveAccessCode: "Have an access code?",
    lineup: "Lineup",
    about: "About",
    venue: "Venue",
    goodToKnow: "Good to know",
    moreFromOrganizer: "More from {organizer}",
    unavailableTitle: "This event isn’t available",
    unavailableBody: "The organizer removed it or it’s still loading.",
  },
  tickets: {
    myTickets: "My tickets",
    upcoming: "Upcoming",
    past: "Past",
    holdNotice: "We hold your tickets for {minutes} minutes while you check out.",
    count: { one: "{count} ticket", other: "{count} tickets" },
    beforeFees: "{quantity} × {tier} · before fees",
  },
  checkout: {
    title: "Checkout",
    order: "Order",
    payment: "Payment",
    discountCode: "Discount code",
    apply: "Apply",
    applied: "Applied",
    fees: "Fees",
    total: "Total",
    pay: "Pay {amount}",
    youreIn: "You’re in",
  },
  settings: {
    title: "Settings",
    language: "Language",
    notifications: "Notifications",
    city: "City",
    signOut: "Sign out",
    deleteAccount: "Delete account",
  },
  languages: {
    en: "English",
    es: "Español",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "No connection. Check your internet and try again.",
  },
} as const;
