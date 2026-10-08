import type {
  CategoryData,
  FilterCategory,
} from "@project-flame/ui";

// =============================================================================
// PARTNER LOGOS — local assets under apps/mobile/assets/
// =============================================================================
import type { ImageSourcePropType } from "react-native";

export interface PartnerLogo {
  id: string;
  name: string;
  source: ImageSourcePropType;
  width: number;
  height: number;
}

export const partnerLogos: PartnerLogo[] = [
  { id: "zlu", name: "ZLU", source: require("../assets/zlu-logo.png"), width: 60, height: 32 },
  { id: "kora", name: "Kora", source: require("../assets/kora-logo.png"), width: 60, height: 32 },
  { id: "hush", name: "Hush", source: require("../assets/hush-logo.png"), width: 60, height: 32 },
  { id: "g2g", name: "G2G", source: require("../assets/g2g-logo.png"), width: 60, height: 32 },
  { id: "cf", name: "CF", source: require("../assets/cf-logo.png"), width: 60, height: 32 },
];

// =============================================================================
// CATEGORIES
// =============================================================================
export const categories: CategoryData[] = [
  {
    id: "cat-1",
    name: "Concert",
    imageUrl:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=200&q=80",
  },
  {
    id: "cat-2",
    name: "Theater",
    imageUrl:
      "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=200&q=80",
  },
  {
    id: "cat-3",
    name: "Party",
    imageUrl:
      "https://images.unsplash.com/photo-1545128485-c400e7702796?w=200&q=80",
  },
  {
    id: "cat-4",
    name: "Festival",
    imageUrl:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=200&q=80",
  },
  {
    id: "cat-5",
    name: "Fashion",
    imageUrl:
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=200&q=80",
  },
];

// =============================================================================
// FAQs — now in @project-flame/lib (shared between web and mobile)
// =============================================================================

// =============================================================================
// EVENTS PAGE FILTER CATEGORIES
// =============================================================================
export type { FilterCategory };

export const eventFilterCategories: FilterCategory[] = [
  { id: "all", label: "All" },
  { id: "concert", label: "Concert" },
  { id: "celebration", label: "Celebration" },
  { id: "performance", label: "Performance" },
  { id: "other", label: "Other" },
];

// =============================================================================
// MENU ITEMS
// =============================================================================
export interface MenuItemData {
  id: string;
  label: string;
}

export const userMenuItems: MenuItemData[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

// Kept for upcoming Organizer Dashboard (Phase 4). Not dead code.
export const organizerMenuItems: MenuItemData[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "create-event", label: "Create Event" },
  { id: "rsvp-management", label: "RSVP Management" },
  { id: "settings", label: "Settings" },
];

// =============================================================================
// DASHBOARD
// =============================================================================
export interface DashboardStats {
  totalTickets: number;
  pending: number;
  purchased: number;
  readyToBuy: number;
}

export const dashboardStats: DashboardStats = {
  totalTickets: 4,
  pending: 1,
  purchased: 2,
  readyToBuy: 1,
};

export type TicketStatus = "purchased" | "pending" | "ready_to_buy";

export interface DashboardTicket {
  id: string;
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  ticketQuantity: number;
  price: number;
  status: TicketStatus;
}

export const dashboardTickets: DashboardTicket[] = [
  {
    id: "ticket-1",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    ticketQuantity: 2,
    price: 201,
    status: "purchased",
  },
  {
    id: "ticket-2",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    ticketQuantity: 2,
    price: 201,
    status: "purchased",
  },
  {
    id: "ticket-3",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    ticketQuantity: 2,
    price: 201,
    status: "pending",
  },
  {
    id: "ticket-4",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    ticketQuantity: 2,
    price: 201,
    status: "ready_to_buy",
  },
];

export interface DashboardUser {
  name: string;
  avatarUrl: string;
}

export const dashboardUser: DashboardUser = {
  name: "User",
  avatarUrl:
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80",
};

// =============================================================================
// ORGANIZER DASHBOARD
// =============================================================================
export interface OrgDashboardStats {
  totalEvents: number;
  totalRevenue: number;
}

export const orgDashboardStats: OrgDashboardStats = {
  totalEvents: 3,
  totalRevenue: 287.3,
};

export interface OrgEvent {
  id: string;
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  attendees: number;
  revenue: number;
}

export const orgEvents: OrgEvent[] = [
  {
    id: "org-event-1",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    attendees: 2,
    revenue: 201,
  },
  {
    id: "org-event-2",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    attendees: 2,
    revenue: 201,
  },
  {
    id: "org-event-3",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    attendees: 2,
    revenue: 201,
  },
];

// =============================================================================
// ORG EVENT DETAIL
// =============================================================================
export interface OrgPromoCode {
  id: string;
  code: string;
  discountPercent: number;
  usedCount: number;
  maxUses: number;
}

export interface OrgPromoterLink {
  id: string;
  url: string;
}

export interface OrgPurchaseStats {
  ticketQuantity: number;
  requestedTickets: number;
  soldTickets: number;
  /** Revenue in cents (same convention as all other monetary values in the project). */
  revenue: number;
}

export interface OrgSearchUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

export interface OrgEventDetail {
  id: string;
  eventName: string;
  description: string;
  bannerImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  promoCodes: OrgPromoCode[];
  promoterLinks: OrgPromoterLink[];
  purchaseStats: OrgPurchaseStats;
  searchUsers: OrgSearchUser[];
}

const orgEventDetailBase: OrgEventDetail = {
  id: "",
  eventName: "Event Name",
  description:
    "Lorem ipsum dolor sit amet consectetur. At enim facilisis quisque pellentesque cursus venenatis tempor at. Ac commodo cum volutpat lorem etiam in augue. Risus dignissim aliquam morbi nisl pellentesque id elit. Dictum adipiscing massa ultrices eu.",
  bannerImageUrl:
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80",
  date: "Monday, 04 Dec, 2025",
  timeRange: "16:00 - 18:00 GMT",
  location: "36 Guild Street London, UK",
  promoCodes: [
    { id: "promo-1", code: "ONE100", discountPercent: 10, usedCount: 0, maxUses: 1 },
    { id: "promo-2", code: "ONE50", discountPercent: 15, usedCount: 1, maxUses: 1 },
  ],
  promoterLinks: [{ id: "link-1", url: "Flame/link_name/hhh" }],
  purchaseStats: {
    ticketQuantity: 16,
    requestedTickets: 3,
    soldTickets: 6,
    revenue: 14000,
  },
  searchUsers: [
    {
      id: "user-1",
      name: "Anne Smith",
      email: "A.smith@gmail.com",
      avatarUrl:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80",
    },
  ],
};

export const orgEventDetailsById: Record<string, OrgEventDetail> = {
  "org-event-1": {
    ...orgEventDetailBase,
    id: "org-event-1",
    bannerImageUrl: orgEvents[0].eventImageUrl.replace("w=100", "w=600"),
  },
  "org-event-2": {
    ...orgEventDetailBase,
    id: "org-event-2",
    bannerImageUrl: orgEvents[1].eventImageUrl.replace("w=100", "w=600"),
  },
  "org-event-3": {
    ...orgEventDetailBase,
    id: "org-event-3",
    bannerImageUrl: orgEvents[2].eventImageUrl.replace("w=100", "w=600"),
  },
};

export function getOrgEventDetail(
  id: string | null | undefined
): OrgEventDetail | null {
  if (!id) return null;
  return orgEventDetailsById[id] ?? null;
}

// =============================================================================
// RSVP MANAGEMENT
// =============================================================================
export interface RsvpEvent {
  id: string;
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  pendingRequests: number;
}

export const rsvpEvents: RsvpEvent[] = [
  {
    id: "rsvp-event-1",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    pendingRequests: 2,
  },
  {
    id: "rsvp-event-2",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    pendingRequests: 2,
  },
  {
    id: "rsvp-event-3",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    pendingRequests: 2,
  },
];

export type RsvpStatus = "pending" | "approved" | "rejected";

export interface RsvpRequest {
  id: string;
  personName: string;
  personId: string;
  tierName: string;
  ticketCount: number;
  eventDate: string;
  price: number;
  status: RsvpStatus;
  statusDate?: string;
}

export interface RsvpDetailStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export const rsvpDetailStats: RsvpDetailStats = {
  total: 4,
  pending: 1,
  approved: 2,
  rejected: 1,
};

export const rsvpRequests: RsvpRequest[] = [
  {
    id: "rsvp-req-1",
    personName: "Wagner Ona Larco",
    personId: "123-333-3333",
    tierName: "GA/ Stage 3",
    ticketCount: 1,
    eventDate: "Nov 10",
    price: 8000,
    status: "pending",
  },
  {
    id: "rsvp-req-2",
    personName: "Wagner Ona Larco",
    personId: "123-333-3333",
    tierName: "GA/ Stage 3",
    ticketCount: 1,
    eventDate: "Nov 10",
    price: 8000,
    status: "approved",
    statusDate: "Nov 01",
  },
  {
    id: "rsvp-req-3",
    personName: "Wagner Ona Larco",
    personId: "123-333-3333",
    tierName: "GA/ Stage 3",
    ticketCount: 1,
    eventDate: "Nov 10",
    price: 8000,
    status: "approved",
    statusDate: "Nov 01",
  },
  {
    id: "rsvp-req-4",
    personName: "Wagner Ona Larco",
    personId: "123-333-3333",
    tierName: "GA/ Stage 3",
    ticketCount: 1,
    eventDate: "Nov 10",
    price: 8000,
    status: "rejected",
    statusDate: "Sep 25",
  },
];

// =============================================================================
// CREATE EVENT — TIERS & STAGES
// =============================================================================
export interface CreateEventTier {
  id: string;
  name: string;
  price: number;
  totalAvailable: number;
  sold: number;
  perUserLimit: number;
  hasPriceStages: boolean;
}

export const createEventTiers: CreateEventTier[] = [
  {
    id: "tier-1",
    name: "Early Bird",
    price: 0,
    totalAvailable: 100,
    sold: 0,
    perUserLimit: 1,
    hasPriceStages: false,
  },
  {
    id: "tier-2",
    name: "General Admission",
    price: 25,
    totalAvailable: 200,
    sold: 45,
    perUserLimit: 4,
    hasPriceStages: true,
  },
];

export interface CreateEventStage {
  id: string;
  stageName: string;
  tierName: string;
  price: number;
  startDate: string;
  endDate: string;
  ticketCount: number;
}

export const createEventStages: CreateEventStage[] = [
  {
    id: "stage-1",
    stageName: "Stage 1",
    tierName: "GA",
    price: 20,
    startDate: "12/11/2025: 13:00",
    endDate: "13/11/2025: 16:00",
    ticketCount: 12,
  },
  {
    id: "stage-2",
    stageName: "Stage 2",
    tierName: "GA",
    price: 20,
    startDate: "12/11/2025: 13:00",
    endDate: "13/11/2025: 16:00",
    ticketCount: 12,
  },
  {
    id: "stage-3",
    stageName: "Stage 3",
    tierName: "GA",
    price: 20,
    startDate: "12/11/2025: 13:00",
    endDate: "13/11/2025: 16:00",
    ticketCount: 12,
  },
];

// =============================================================================
// EVENTS MANAGEMENT (Edit Event)
// =============================================================================
export interface EditEventData {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  address: string;
  rsvpRequired: boolean;
}

export interface ManageEvent {
  id: string;
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  attendees: number;
  totalCapacity: number;
  ticketTierCount: number;
}

export const manageEvents: ManageEvent[] = [
  {
    id: "manage-event-1",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    attendees: 2,
    totalCapacity: 100,
    ticketTierCount: 2,
  },
  {
    id: "manage-event-2",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    attendees: 2,
    totalCapacity: 100,
    ticketTierCount: 2,
  },
  {
    id: "manage-event-3",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    attendees: 2,
    totalCapacity: 100,
    ticketTierCount: 2,
  },
];

export const editEventMock: EditEventData = {
  id: "org-event-1",
  name: "EVENT NAME",
  description:
    "Lorem ipsum dolor sit amet consectetur. At enim facilisis quisque pellentesque cursus venenatis tempor at. Ac commodo cum volutpat lorem etiam in augue. Risus dignissim aliquam morbi nisl pellentesque id elit. Dictum adipiscing massa ultrices eu.",
  imageUrl:
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80",
  startDate: "04 Dec, 2025",
  startTime: "16:00",
  endDate: "04 Dec, 2025",
  endTime: "18:00",
  address: "36 Guild Street London, UK",
  rsvpRequired: false,
};


// =============================================================================
// PURCHASE HISTORY
// =============================================================================
export interface HistoryTicket {
  id: string;
  eventName: string;
  eventImageUrl: string;
  date: string;
  timeRange: string;
  location: string;
  ticketQuantity: number;
  price: number;
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================
export type NotificationStatus = "approved" | "rejected";

export interface NotificationItem {
  id: string;
  purchaseDate: string;
  eventName: string;
  status: NotificationStatus;
  statusDate: string;
  tierName: string;
  ticketCount: number;
  eventDate: string;
  price: number;
}

// Notification prices are in cents (project convention). 8000 = $80.00
export const notifications: NotificationItem[] = [
  {
    id: "notif-1",
    purchaseDate: "Monday, April 14",
    eventName: "Event Name",
    status: "approved",
    statusDate: "Nov 01",
    tierName: "GA/ Stage 3",
    ticketCount: 1,
    eventDate: "Nov 10",
    price: 8000,
  },
  {
    id: "notif-2",
    purchaseDate: "Monday, April 14",
    eventName: "Event Name",
    status: "rejected",
    statusDate: "Sep 25",
    tierName: "GA/ Stage 3",
    ticketCount: 1,
    eventDate: "Nov 10",
    price: 8000,
  },
  {
    id: "notif-3",
    purchaseDate: "Monday, April 14",
    eventName: "Event Name",
    status: "approved",
    statusDate: "Nov 01",
    tierName: "GA/ Stage 3",
    ticketCount: 1,
    eventDate: "Nov 10",
    price: 8000,
  },
  {
    id: "notif-4",
    purchaseDate: "Monday, April 14",
    eventName: "Event Name",
    status: "approved",
    statusDate: "Nov 01",
    tierName: "GA/ Stage 3",
    ticketCount: 1,
    eventDate: "Nov 10",
    price: 8000,
  },
];

// =============================================================================
// SETTINGS PROFILE
// =============================================================================
export interface SettingsProfile {
  photoUrl: string;
  fullName: string;
  phoneNumber: string;
  billingAddress: string;
  city: string;
  country: string;
}

export const settingsProfile: SettingsProfile = {
  photoUrl:
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&q=80",
  fullName: "Anne Davies",
  phoneNumber: "+1 912 233 2446",
  billingAddress: "Covent Garden35, Apple Market, The Piazza",
  city: "London",
  country: "United Kingdom",
};

// =============================================================================
// ORGANIZATION SETTINGS
// =============================================================================
export interface OrgSettingsProfile {
  photoUrl: string;
  instagram: string;
  companyName: string;
  contactName: string;
  phoneNumber: string;
  email: string;
  city: string;
  country: string;
  description: string;
}

export const orgSettingsProfile: OrgSettingsProfile = {
  photoUrl:
    "https://images.unsplash.com/photo-1557683316-973673baf926?w=600&q=80",
  instagram: "Comp.exp",
  companyName: "Bonton",
  contactName: "John Smith",
  phoneNumber: "+1 912 233 2446",
  email: "bonton@gmail.com",
  city: "Guayaquil",
  country: "Ecuador",
  description:
    "Lorem ipsum dolor sit amet consectetur. At enim facilisis quisque pellentesque cursus venenatis tempor at.",
};

// =============================================================================
// TICKET DETAIL (QR screen)
// =============================================================================
export interface TicketDetailData {
  eventName: string;
  eventBannerUrl: string;
  organizerName: string;
  description: string;
  date: string;
  timeRange: string;
  location: string;
}

const ticketDetailBase: TicketDetailData = {
  eventName: "Event Name",
  eventBannerUrl:
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80",
  organizerName: "Kora Experiences",
  description:
    "Lorem ipsum dolor sit amet consectetur. At enim facilisis quisque pellentesque cursus venenatis tempor at. Ac commodo cum volutpat lorem etiam in augue. Risus dignissim aliquam morbi nisl pellentesque id elit. Dictum adipiscing massa ultrices eu.",
  date: "Monday, 04 Dec, 2025",
  timeRange: "16:00 - 18:00 GMT",
  location: "36 Guild Street London, UK",
};

/** @deprecated Use getTicketDetailById for id-driven lookup */
export const ticketDetailMock = ticketDetailBase;

export const historyTickets: HistoryTicket[] = [
  {
    id: "hist-1",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    ticketQuantity: 2,
    price: 201,
  },
  {
    id: "hist-2",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    ticketQuantity: 2,
    price: 201,
  },
  {
    id: "hist-3",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    ticketQuantity: 2,
    price: 201,
  },
  {
    id: "hist-4",
    eventName: "Event Name",
    eventImageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=100&q=80",
    date: "Monday, 04 Dec, 2025",
    timeRange: "16:00 - 18:00 GMT",
    location: "36 Guild Street London, UK",
    ticketQuantity: 2,
    price: 201,
  },
];

/** Map ticket id -> full detail. Phase 4: mock lookup; Phase 5 will fetch from API. */
export const ticketDetailsById: Record<string, TicketDetailData> = {
  "ticket-1": {
    ...ticketDetailBase,
    eventBannerUrl: dashboardTickets[0].eventImageUrl.replace("w=100", "w=600"),
  },
  "ticket-2": {
    ...ticketDetailBase,
    eventBannerUrl: dashboardTickets[1].eventImageUrl.replace("w=100", "w=600"),
  },
  "ticket-3": {
    ...ticketDetailBase,
    eventBannerUrl: dashboardTickets[2].eventImageUrl.replace("w=100", "w=600"),
  },
  "ticket-4": {
    ...ticketDetailBase,
    eventBannerUrl: dashboardTickets[3].eventImageUrl.replace("w=100", "w=600"),
  },
  "hist-1": {
    ...ticketDetailBase,
    eventBannerUrl: historyTickets[0].eventImageUrl.replace("w=100", "w=600"),
  },
  "hist-2": {
    ...ticketDetailBase,
    eventBannerUrl: historyTickets[1].eventImageUrl.replace("w=100", "w=600"),
  },
  "hist-3": {
    ...ticketDetailBase,
    eventBannerUrl: historyTickets[2].eventImageUrl.replace("w=100", "w=600"),
  },
  "hist-4": {
    ...ticketDetailBase,
    eventBannerUrl: historyTickets[3].eventImageUrl.replace("w=100", "w=600"),
  },
};

export function getTicketDetailById(
  id: string | null | undefined
): TicketDetailData | null {
  if (!id) return null;
  return ticketDetailsById[id] ?? null;
}
