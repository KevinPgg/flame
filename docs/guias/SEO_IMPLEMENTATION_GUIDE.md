# SEO Implementation Guide for Flame

This guide documents the comprehensive SEO improvements implemented across the Flame event ticketing platform.

## Overview

The SEO implementation includes:

- **Metadata optimization** for all pages
- **Structured data (JSON-LD)** for enhanced search results
- **Dynamic sitemap generation** for all pages and events
- **Robots.txt** for search engine crawler guidance
- **Open Graph & Twitter Cards** for social media sharing
- **Centralized SEO configuration** for easy maintenance

---

## 1. Core SEO Configuration

### Location: `app/lib/seo-config.ts`

This centralized configuration file contains:

#### Site Configuration

```typescript
export const siteConfig = {
  name: "Flame",
  description: "Ecuador's premier event ticketing platform",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://flame.ec",
  keywords: [...],
  locale: "es_EC",
  social: { twitter, facebook, instagram }
}
```

#### Metadata Generation Helper

```typescript
generateMetadata({ title, description, image, url, noIndex });
```

- Automatically generates complete metadata including Open Graph and Twitter Cards
- Handles canonical URLs
- Configures robots directives
- Supports custom images for each page

#### Structured Data

- **Organization Schema**: Global schema for Flame as a company
- **Event Schema Generator**: Dynamic schema for individual events
  - Includes event details, location, dates, offers
  - Shows ticket availability and pricing
  - Helps Google display rich results for events

---

## 2. Root Layout

### Location: `app/layout.tsx`

**Key Changes:**

- Applied default metadata using `generateMetadata({})`
- Added Organization JSON-LD structured data
- Set HTML lang to "es" (Spanish - primary language)
- Includes Organization schema in `<head>`

**Result:**

- All pages inherit base SEO metadata
- Google understands Flame as an organization
- Proper language declaration for search engines

---

## 3. Page-Level Metadata

### Static Pages

All major pages now have custom metadata:

#### Homepage (`app/page.tsx`)

```typescript
export const metadata: Metadata = generateSEOMetadata({
  title: "Discover Amazing Events in Ecuador",
  description: "Find and purchase tickets for the best concerts, festivals...",
});
```

#### Events Listing (`app/events/page.tsx`)

- Title: "All Events"
- Description highlights browsing and ticket purchase
- URL: `/events`

#### Other Pages

- `/about-flame` - About page
- `/contact` - Contact page with support information
- `/careers` - Careers opportunities
- `/faqs` - Frequently asked questions

### Dynamic Pages

#### Individual Event Pages (`app/events/[slug]/page.tsx`)

**Features:**

1. **Dynamic Metadata Function**

   ```typescript
   export async function generateMetadata({ params });
   ```

   - Fetches event data
   - Generates SEO-optimized title and description
   - Includes event image for Open Graph
   - Shows pricing ("Desde $X.XX")
   - Extracts keywords from event data

2. **Event Structured Data**
   - Full Event schema with dates, location, offers
   - Shows real-time ticket availability
   - Includes organizer information
   - Supports both online and offline events

**Result:**

- Each event page is uniquely optimized
- Rich snippets in Google Search
- Better click-through rates from search results
- Proper social media previews when shared

---

## 4. Sitemap Generation

### Location: `app/sitemap.ts`

**Features:**

- Dynamically generates sitemap at build time
- Includes all static pages with appropriate priorities
- Fetches all published events from database
- Sets proper change frequencies:
  - Homepage: daily
  - Events listing: hourly
  - Individual events: daily
  - Legal pages: yearly

**Priorities:**

- Homepage: 1.0 (highest)
- Events listing: 0.9
- Individual events: 0.8
- Contact/FAQs: 0.5-0.6
- Legal pages: 0.3

**Access:** `https://flame.ec/sitemap.xml`

---

## 5. Robots.txt

### Location: `app/robots.ts`

**Configuration:**

- Allows all crawlers on public pages
- Blocks private areas:

  - `/api/` - API endpoints
  - `/admin/` - Admin dashboard
  - `/account/` - User accounts
  - `/onboarding/` - Onboarding flow
  - `/organizer/` - Organizer dashboard
  - `/purchase/` - Purchase flow
  - `/qr-scanner/` - QR scanning
  - `/test-api/` - Test endpoints

- Points to sitemap location

**Access:** `https://flame.ec/robots.txt`

---

## 6. Metadata Per Page Type

### Standard Metadata Includes:

1. **Title Tags**

   - Format: `{Page Title} | Flame`
   - Optimized length (< 60 characters)

2. **Meta Descriptions**

   - 150-160 characters
   - Action-oriented
   - Includes keywords naturally

3. **Keywords**

   - Relevant to Ecuador events
   - Mix of English/Spanish terms
   - Location-specific

4. **Open Graph Tags**

   - `og:title`, `og:description`, `og:image`
   - `og:type` (website for pages, event for events)
   - `og:url` (canonical URL)
   - `og:site_name`

5. **Twitter Cards**

   - `summary_large_image` format
   - Same title/description as OG
   - Optimized images

6. **Canonical URLs**
   - Prevents duplicate content issues
   - Points to primary URL for each page

---

## 7. Structured Data (JSON-LD)

### Organization Schema (Global)

Located in root layout:

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Flame",
  "url": "https://flame.ec",
  "logo": "/flame-hero.jpg",
  "sameAs": [social media links]
}
```

### Event Schema (Per Event)

Dynamically generated for each event page:

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Event Title",
  "startDate": "2025-...",
  "location": {...},
  "offers": [{ticket tiers}]
}
```

---

## 8. Environment Variables

### Required Variable

Add to `.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=https://flame.ec
```

**Production:** Use your production domain
**Development:** Use `http://localhost:3000` or leave unset (will default)

This variable is used for:

- Generating absolute URLs in metadata
- Sitemap URLs
- Canonical URLs
- Open Graph URLs

---

## 9. Testing Your SEO

### Tools to Use:

1. **Google Search Console**

   - Submit sitemap: `https://flame.ec/sitemap.xml`
   - Monitor indexing status
   - Check for errors

2. **Google Rich Results Test**

   - URL: https://search.google.com/test/rich-results
   - Test individual event pages
   - Verify Event structured data

3. **Facebook Sharing Debugger**

   - URL: https://developers.facebook.com/tools/debug/
   - Test Open Graph tags
   - Clear cache when updating

4. **Twitter Card Validator**

   - URL: https://cards-dev.twitter.com/validator
   - Test Twitter Card appearance

5. **Lighthouse (Chrome DevTools)**
   - Run SEO audit
   - Check for best practices
   - Verify mobile-friendliness

### Manual Checks:

```bash
# View sitemap
curl https://flame.ec/sitemap.xml

# View robots.txt
curl https://flame.ec/robots.txt

# Check meta tags
curl -s https://flame.ec | grep -i "meta"

# View JSON-LD
curl -s https://flame.ec | grep -A 20 "application/ld+json"
```

---

## 10. Maintenance Guide

### When Creating New Pages:

1. Import the SEO helper:

   ```typescript
   import { generateMetadata as generateSEOMetadata } from "../lib/seo-config";
   ```

2. Export metadata:

   ```typescript
   export const metadata: Metadata = generateSEOMetadata({
     title: "Page Title",
     description: "Page description (150-160 chars)",
     url: "/page-url",
   });
   ```

3. Add to sitemap if needed (edit `app/sitemap.ts`)

### When Updating Social Media Handles:

Edit `app/lib/seo-config.ts`:

```typescript
social: {
  twitter: "@flame_ec",
  facebook: "flame.ec",
  instagram: "@flame.ec"
}
```

### When Changing Domain:

Update `NEXT_PUBLIC_SITE_URL` in environment variables

### When Adding New Event Fields:

Update `generateEventSchema()` in `app/lib/seo-config.ts` to include new structured data fields

---

## 11. Best Practices

### Images for SEO:

- **Recommended size:** 1200x630px (Open Graph standard)
- **Format:** JPG or PNG
- **File size:** < 1MB
- **Alt text:** Always include descriptive alt text
- **File names:** Use descriptive names (e.g., `yoga-workshop-quito.jpg`)

### Content Guidelines:

- **Titles:** 50-60 characters
- **Descriptions:** 150-160 characters
- **Keywords:** Use naturally, don't stuff
- **Unique content:** Each page should have unique title/description
- **Mobile-first:** Ensure all content works on mobile

### Performance:

- SEO is affected by page speed
- Use Next.js Image optimization
- Implement proper caching (already configured with ISR)
- Monitor Core Web Vitals

---

## 12. Expected Results

### Short Term (1-2 weeks):

- Google crawls and indexes new pages
- Sitemap recognized in Search Console
- Social media previews work correctly

### Medium Term (1-2 months):

- Improved search rankings for brand terms
- Rich results appear for events
- Increased organic traffic

### Long Term (3-6 months):

- Ranking for competitive keywords
- Significant organic traffic growth
- Reduced bounce rates from search
- Better social media engagement

---

## 13. Monitoring Checklist

### Weekly:

- [ ] Check Google Search Console for errors
- [ ] Monitor indexing status
- [ ] Review new events in sitemap

### Monthly:

- [ ] Audit page titles and descriptions
- [ ] Check for broken canonical URLs
- [ ] Test structured data with Google tool
- [ ] Review organic traffic trends
- [ ] Check for 404 errors

### Quarterly:

- [ ] Full SEO audit with Lighthouse
- [ ] Update keywords based on trends
- [ ] Review and update social media metadata
- [ ] Analyze competitor SEO strategies

---

## 14. Common Issues & Solutions

### Issue: Sitemap not updating with new events

**Solution:** Check that `supabaseAdmin` connection is working and events are marked as "published"

### Issue: Event rich results not showing

**Solution:**

1. Verify event has all required fields (title, dates, location)
2. Test with Google Rich Results Test
3. Ensure offers array is properly formatted

### Issue: Social media previews not updating

**Solution:**

1. Clear cache in Facebook Sharing Debugger
2. Wait 24 hours for cache to expire
3. Verify image URLs are absolute, not relative

### Issue: Pages not being indexed

**Solution:**

1. Check robots.txt isn't blocking the page
2. Verify page is in sitemap
3. Submit URL for indexing in Search Console
4. Check for noindex meta tag

---

## 15. Resources

- [Next.js Metadata API](https://nextjs.org/docs/app/building-your-application/optimizing/metadata)
- [Schema.org Event Documentation](https://schema.org/Event)
- [Google Search Central](https://developers.google.com/search)
- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards Documentation](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)

---

## Summary

The Flame platform now has enterprise-level SEO implementation with:
✅ Complete metadata coverage
✅ Structured data for rich results
✅ Dynamic sitemap generation
✅ Proper robots.txt configuration
✅ Social media optimization
✅ Centralized, maintainable configuration

All pages are now optimized for search engines and will perform significantly better in organic search results.
