/**
 * SEO Keywords Configuration
 *
 * Note: Meta keywords tag is not used by major search engines for ranking.
 * This configuration is designed for:
 * - Internal site search and filtering
 * - Content generation and suggestions
 * - Dynamic page title/description generation
 * - Category tagging and organization
 * - Analytics and tracking
 */

export const keywordGroups = {
  brand: [
    "flame",
    "flme",
    "flame app",
    "flame tickets",
    "flame events",
    "flame eventos",
    "flme.co",
  ],

  ticketing: {
    english: [
      "event tickets",
      "buy tickets online",
      "purchase tickets",
      "book tickets",
      "ticket platform",
      "online ticketing",
      "digital tickets",
      "e-tickets",
      "mobile tickets",
    ],
    spanish: [
      "comprar tickets",
      "boletos online",
      "entradas online",
      "venta de entradas",
      "plataforma de tickets",
    ],
  },

  eventTypes: {
    english: [
      "concert tickets",
      "festival tickets",
      "music events",
      "live concerts",
      "music festivals",
      "workshops",
      "seminars",
      "conferences",
      "networking events",
      "business events",
      "cultural events",
      "sports events",
      "theater tickets",
      "comedy shows",
      "nightlife events",
      "parties",
      "club events",
      "art exhibitions",
      "food festivals",
      "tech events",
      "startup events",
      "wellness events",
      "yoga events",
      "fitness events",
    ],
    spanish: [
      "conciertos",
      "festivales",
      "eventos musicales",
      "conciertos en vivo",
      "festivales de música",
      "talleres",
      "seminarios",
      "conferencias",
      "eventos de networking",
      "eventos empresariales",
      "eventos culturales",
      "eventos deportivos",
      "teatro",
      "shows de comedia",
      "eventos nocturnos",
      "fiestas",
      "eventos de club",
      "exposiciones de arte",
      "festivales gastronómicos",
      "eventos de tecnología",
      "eventos de startups",
      "eventos de bienestar",
      "eventos de yoga",
      "eventos de fitness",
    ],
  },

  // Global, location-agnostic keywords. Per-event pages generate their own
  // city-specific keywords dynamically in events/[slug]/page.tsx, so we don't
  // need to hardcode city lists here.
  locations: [
    "events near me",
    "local events",
    "events nearby",
    "eventos cerca de mí",
    "eventos locales",
    "international events",
    "global events",
  ],

  locationQueries: [
    "what to do this weekend",
    "things to do tonight",
    "things to do near me",
    "que hacer este fin de semana",
    "que hacer cerca de mí",
  ],

  // Ecuadorian long-tail keywords retained for our existing user base and
  // indexed legacy event pages. These are niche and not part of default copy.
  legacyRegional: [
    "flame ecuador",
    "eventos en Ecuador",
    "events in Ecuador",
    "eventos Quito",
    "eventos Guayaquil",
    "eventos Cuenca",
    "que hacer en Quito",
    "que hacer en Guayaquil",
  ],

  actions: {
    english: [
      "find events",
      "discover events",
      "explore events",
      "event discovery",
      "reserve tickets",
      "secure tickets",
      "get tickets",
    ],
    spanish: [
      "encontrar eventos",
      "descubrir eventos",
      "explorar eventos",
      "reservar tickets",
      "conseguir entradas",
    ],
  },

  features: {
    english: [
      "QR code tickets",
      "instant tickets",
      "secure ticketing",
      "easy checkout",
      "fast tickets",
      "promo codes",
      "discount tickets",
      "early bird tickets",
      "VIP tickets",
      "general admission",
    ],
    spanish: [
      "tickets con QR",
      "entradas instantáneas",
      "tickets seguros",
      "checkout fácil",
      "códigos promocionales",
      "tickets con descuento",
      "entradas VIP",
    ],
  },

  trending: {
    english: [
      "upcoming events",
      "popular events",
      "trending events",
      "best events",
      "top events",
    ],
    spanish: [
      "eventos próximos",
      "eventos populares",
      "mejores eventos",
      "eventos destacados",
    ],
  },

  useCases: {
    english: [
      "weekend events",
      "tonight events",
      "this week events",
      "date night",
      "group events",
      "corporate events",
      "private events",
    ],
    spanish: [
      "eventos fin de semana",
      "eventos esta noche",
      "eventos esta semana",
      "eventos grupales",
      "eventos corporativos",
      "eventos privados",
    ],
  },
};

// Flatten nested keyword groups
function flattenKeywords(obj: any): string[] {
  const result: string[] = [];

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      result.push(...value);
    } else if (typeof value === "object") {
      result.push(...flattenKeywords(value));
    }
  }

  return result;
}

// All keywords flattened (useful for search/filtering)
export const allKeywords = flattenKeywords(keywordGroups);

// Core keywords for meta tag (minimal, focused set)
// Note: Only kept for legacy compatibility - not used for SEO ranking
export const coreKeywords = [
  ...keywordGroups.brand,
  "event tickets",
  "concert tickets",
  "festival tickets",
  "buy tickets online",
  "comprar tickets",
  "entradas online",
];

// Get keywords by category for dynamic content generation
export function getKeywordsByCategory(category: keyof typeof keywordGroups) {
  return keywordGroups[category];
}

// Get keywords by language
export function getKeywordsByLanguage(lang: "english" | "spanish") {
  const keywords: string[] = [];

  Object.values(keywordGroups).forEach(group => {
    if (typeof group === "object" && !Array.isArray(group)) {
      if (lang in group) {
        keywords.push(...(group as any)[lang]);
      }
    }
  });

  return keywords;
}

// Search keywords for matching terms (useful for internal search)
export function searchKeywords(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  return allKeywords.filter(keyword =>
    keyword.toLowerCase().includes(lowerQuery)
  );
}

// Get related keywords (same group)
export function getRelatedKeywords(keyword: string): string[] {
  const lowerKeyword = keyword.toLowerCase();

  for (const [groupName, group] of Object.entries(keywordGroups)) {
    const groupKeywords = flattenKeywords({ [groupName]: group });
    if (groupKeywords.some(k => k.toLowerCase() === lowerKeyword)) {
      return groupKeywords.filter(k => k.toLowerCase() !== lowerKeyword);
    }
  }

  return [];
}
