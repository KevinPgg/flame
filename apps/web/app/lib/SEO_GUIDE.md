# SEO Implementation Guide for Flame

## ⚠️ Important: Meta Keywords Don't Work

The `<meta name="keywords">` tag has been **ignored by all major search engines since 2009**. Google, Bing, and others confirmed they don't use it for ranking.

## What Actually Matters for SEO

### 1. **Page Titles** (Most Important) ✅

```typescript
// Good: Descriptive, keyword-rich, under 60 characters
title: "Concert Tickets in Quito | Flame Ecuador";

// Bad: Generic, too long
title: "Events - Flame - The Best Platform Ever Created...";
```

### 2. **Meta Descriptions** ✅

```typescript
// Good: Compelling, includes keywords, 150-160 characters
description: "Buy concert and festival tickets in Ecuador. Secure online ticketing for events in Quito, Guayaquil, and Cuenca. Instant QR code delivery.";

// Bad: Too short, no keywords, not compelling
description: "Buy tickets here.";
```

### 3. **Structured Data (JSON-LD)** ✅ Already Implemented!

Our `generateEventSchema()` function is excellent - keep using it! This is what Google actually reads.

### 4. **Content Quality**

- Use natural language with relevant keywords in page content
- H1, H2, H3 hierarchy
- Long-form, valuable content

### 5. **Technical SEO**

- Fast page load times
- Mobile responsive
- Clean URLs: `/events/concert-quito` not `/events?id=123`
- Image alt text
- Internal linking

## How to Use seo-keywords.ts

The keyword system is now modular and useful for:

### Internal Site Search

```typescript
import { searchKeywords, getRelatedKeywords } from "@/lib/seo-keywords";

// User searches for "conciertos"
const matches = searchKeywords("conciertos");
const related = getRelatedKeywords("conciertos");
```

### Dynamic Content Generation

```typescript
import {
  getKeywordsByCategory,
  getKeywordsByLanguage,
} from "@/lib/seo-keywords";

// Generate location-specific page titles
const locations = getKeywordsByCategory("locations");
// "Events in Quito", "Events in Guayaquil", etc.

// Bilingual content
const spanishEvents = getKeywordsByLanguage("spanish");
```

### Page Title/Description Generation

```typescript
import { keywordGroups } from "@/lib/seo-keywords";

// Dynamic event page title
function generateEventTitle(event: Event) {
  const location = event.city;
  const type = event.category; // e.g., "concert"
  return `${type} Tickets in ${location} | ${event.title} | Flame`;
}

// Rich, keyword-optimized description
function generateEventDescription(event: Event) {
  return `Buy tickets for ${event.title} in ${event.city}, Ecuador. 
    ${event.type} on ${formatDate(event.date)}. 
    Secure online ticketing with instant QR code delivery. 
    Book now on Flame.`;
}
```

### Analytics & Tracking

```typescript
// Track which search terms users actually use
// Match against our keyword groups to understand intent
```

## Action Items for Better SEO

### High Priority

- [ ] Optimize page titles for all routes (see examples above)
- [ ] Write compelling meta descriptions for key pages
- [ ] Ensure JSON-LD structured data on all event pages ✅ (already done!)
- [ ] Add image alt text with descriptive keywords
- [ ] Improve page load speed

### Medium Priority

- [ ] Create blog content targeting long-tail keywords
  - "Best concerts in Quito this month"
  - "How to buy event tickets in Ecuador"
- [ ] Internal linking strategy between events/categories
- [ ] Sitemap optimization ✅ (already have sitemap.ts)
- [ ] Rich snippets for events (FAQ schema, breadcrumbs)

### Low Priority

- [ ] Social media meta tags (OpenGraph, Twitter) ✅ (already done!)
- [ ] Canonical URLs ✅ (already done!)
- [ ] robots.txt optimization ✅ (already done!)

## Example: Optimized Event Page

```typescript
// events/[slug]/page.tsx
export async function generateMetadata({ params }) {
  const event = await fetchEvent(params.slug);

  return {
    // Rich, keyword-optimized title
    title: `${event.title} Tickets | ${event.city} | Flame Ecuador`,

    // Compelling description with natural keywords
    description: `Get tickets for ${event.title} in ${event.city}, Ecuador. 
      ${event.category} event on ${formatDate(event.date)} at ${event.venue}. 
      Secure online booking with instant QR code entry. 
      ${event.ticketsAvailable} tickets remaining.`,

    // Structured data - this is what Google reads!
    other: {
      "application/ld+json": generateEventSchema(event),
    },
  };
}
```

## Resources

- [Google Search Central](https://developers.google.com/search/docs)
- [Meta Keywords Are Dead](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag)
- [JSON-LD for Events](https://developers.google.com/search/docs/appearance/structured-data/event)

## Summary

✅ **Do This:**

- Write great page titles and descriptions
- Use structured data (JSON-LD) - already implemented!
- Create quality content
- Fast, mobile-friendly site
- Use keywords from `seo-keywords.ts` for content generation and internal search

❌ **Don't Worry About:**

- Meta keywords tag (doesn't affect ranking)
- Keyword stuffing
- Exact keyword density
