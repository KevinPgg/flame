# Flame Platform — Complete Feature Overview & Roadmap

**Prepared:** April 7, 2026

---

## What is Flame?

Flame is a full-featured **event ticketing and management platform**. It allows **event organizers** to create, sell, and manage events, and gives **attendees** a seamless way to discover events, purchase tickets, and attend with digital QR-code tickets.

Flame runs today as a **website** and a **native iOS app** for iPhone, sharing the same events, tickets, and accounts. **Stripe** powers all card payments and organizer payouts.

---

## Part 1: Live Today — Web & iOS

Everything below is **live today**. Attendees and organizers can use the **website**, the **iOS app**, or both — interchangeably — with the same login and the same data.

### For Attendees (Ticket Buyers)

| Feature                           | Description                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Event Discovery**               | Browse published events, filter by city, search by name, venue, or description.                                                                              |
| **Event Pages**                   | Each event has its own page — description, venue, date, ticket pricing, images, and clear credit to the **presenting organizers**, including any **partner or co-host organizations** when the event is a collaboration. |
| **Featured Events**               | Highlighted events appear prominently on the home experience.                                                                                                |
| **User Accounts**                 | Create an account, sign in (including sign-in with Google where offered), and manage your profile.                                                           |
| **Ticket Purchasing**             | Choose ticket type and quantity, then check out and pay securely.                                                                                            |
| **Free Tickets**                  | Some events offer free tickets — no payment required.                                                                                                        |
| **RSVP System**                   | Exclusive events may require an RSVP; the organizer approves or declines. Once approved, you can complete purchase if payment is required.                 |
| **Access codes**                  | Some private events ask for a **code** before you can RSVP or buy tickets — so only invited guests get through.                                              |
| **Custom RSVP questions**         | When organizers need extra details, they can collect **custom registration answers** during RSVP (for example preferences or required fields).                 |
| **Dynamic Pricing**               | Ticket prices can step up as tickets sell — “early bird” style stages.                                                                                       |
| **Promo Codes**                   | Enter a discount code at checkout for a percentage off your purchase.                                                                                      |
| **Digital Tickets with QR Codes** | Tickets delivered digitally with unique QR codes — by email, in your account on the web, and in the **ticket wallet on iOS**.                                |
| **My Tickets**                  | See purchased tickets, pending RSVPs, and past events in one place.                                                                                          |
| **Email & mobile alerts**         | Confirmations and important updates by **email**; on **iPhone**, optional **push notifications** for timely reminders (for example RSVP outcomes).           |
| **ID Verification**               | Ecuadorian cédula verification for RSVP events where organizers require it.                                                                                 |

### For Organizers (Event Creators)

| Feature                             | Description                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Event creation & editing**        | Create and update events end to end — details, venue, schedule, images, and ticket setup — **on the web and on iOS**.             |
| **Multiple ticket types**           | General Admission, VIP, reserved tables, or any custom tier names you need.                                                       |
| **Ticket stages (dynamic pricing)** | Automatic price increases as tickets sell (for example Early Bird → Regular → Last Chance).                                       |
| **Sales windows**                   | Control when sales open and close.                                                                                                |
| **Per-person limits**               | Cap how many tickets one person can buy.                                                                                          |
| **Co-host organizations**           | Link **partner organizations** to an event so they share credit, appear on the public page, and work with you on the same event. |
| **Team & event assignments**      | Invite team members with roles, manage your roster, and **assign which events** each organizer on your team is responsible for.   |
| **RSVP management**                 | Review, approve, or reject RSVP requests; paid RSVPs are handled when you approve.                                                |
| **Sales dashboard**                 | Real-time view of sales — tickets sold, revenue, attendees, and RSVP status.                                                    |
| **Guest list export**               | Download guest lists as Excel with buyer details, tiers, and purchase info.                                                   |
| **Promotional codes**               | Create discount codes (5%–100% off) with usage limits.                                                                            |
| **Promotional tickets**             | Issue complimentary tickets — delivered by email with QR codes.                                                                   |
| **Promoter tracking links**         | Unique links so promoters can be credited for the sales they drive.                                                               |
| **QR code scanner**                 | Check people in at the door with a camera — on the web or on iPhone — with validation to prevent duplicate check-ins.             |
| **Multi-organization support**      | Work across multiple organizations from one account.                                                                              |
| **Stripe payouts**                  | Connect Stripe to receive revenue; view balance and request payouts.                                                              |

### Platform capabilities

| Feature                      | Description                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Secure payments (Stripe)** | Card payments through Stripe; organizers connect their own accounts for payouts via Stripe Connect.                                                                 |
| **Ticket hold system**       | Checkout reserves tickets for a limited time so overselling is avoided while someone pays.                                                                          |
| **Real-time inventory**      | Availability stays in sync as tickets sell.                                                                                                                       |
| **Email**                    | Automated messages for confirmations, RSVP updates, event changes, and promotional tickets.                                                                       |
| **SEO (web)**                | Events are set up for search engines with proper metadata.                                                                                                        |
| **Legal & support**          | Privacy, terms, purchase terms, cookies, FAQs, and a contact path for support.                                                                                    |
| **Maintenance mode**         | Ability to pause public access during updates while testing internally.                                                                                           |

---

## Part 2: The iOS App — Design & Experience

The **native iOS app** is the mobile companion to the website: same catalog, same checkout rules, same tickets — with an experience tuned for iPhone.

### Modern design (mobile-first)

The app uses Flame’s **current visual identity** on mobile:

- **Dark-themed interface** — deep backgrounds suited to events and nightlife.
- **Brand red accents** — Flame red used for emphasis where it belongs (for example status on imagery).
- **Clean typography** — Poppins for a modern, readable look.
- **Glass-style cards** — light translucency and depth on cards and surfaces.
- **Native motion** — standard iOS transitions and gestures.

That same design language is **rolling out to the web** over time so both surfaces feel like one brand.

### What the iOS app includes

#### Home

| Feature                | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Hero carousel**      | Swipeable banner for featured and promoted events.                              |
| **Explore categories** | Browse by category (Music, Nightlife, Food & Drink, Arts, Sports, and more).    |
| **Featured & upcoming** | Highlighted events and scrollable upcoming lists.                            |
| **Spotlight & partners** | Spotlight blocks and partner logos where configured.                        |
| **FAQ**                | Common questions on the home screen.                                            |

#### Events & tickets

| Feature                      | Description                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| **Browse & search**          | Same event catalog as the web — search and filters.                                              |
| **Event detail**             | Full information, images, venue, pricing, and organizer / co-host credit.                        |
| **Ticket selection**         | Choose tier and quantity; checkout with promos and holds, same rules as the web.                 |
| **Apple Pay & cards**        | Pay with Apple Pay or card through Stripe’s native payment sheet.                              |
| **Digital ticket wallet**    | All tickets with QR codes in one place on the phone.                                            |
| **RSVP**                     | Request access, enter access codes if required, and complete custom questions when asked.       |
| **Event links**              | Open shared event URLs in the app when it makes sense for a smooth handoff from messages or social posts. |

#### Account & notifications

| Feature                 | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **Ticket wallet**       | Scannable QR codes without digging through email.                                              |
| **History & profile**   | Past events and profile settings.                                                              |
| **Push notifications**  | Timely alerts on the phone alongside email (for example RSVP and purchase confirmations).       |
| **Notification inbox**  | In-app list of alerts you can review and clear.                                                |

#### Organizer tools on iPhone

| Feature                 | Description                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **Events on the go**    | See your events, stats, and key actions from the dashboard.                                   |
| **Create & edit**       | Set up and adjust events and tickets from the phone.                                          |
| **RSVP & promotions**   | Work RSVP queues and manage promo codes and promoter links.                                    |
| **Team & co-hosts**     | Manage members, assignments, and co-host organizations for your events.                       |
| **Door check-in**       | Native camera scanner for fast entry at the venue.                                             |

---

## Part 3: One Platform, Two Front Doors

Today Flame is **one platform** with **two ways in** — the website and the iOS app — backed by the same system.

### Website

Everything in Part 1 remains available in the browser, with an **ongoing design refresh** toward the same modern look as the mobile app.

### iOS app

A **native iPhone app** for discovery, purchase, wallet, notifications, and full organizer workflows on the move.

### What stays the same across both

| Capability        | Details                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| **Same events**   | One catalog; create or edit on either surface.                                   |
| **Same tickets**  | A ticket bought on the web works in the app and vice versa; QR codes match.      |
| **Same accounts** | One login for web and iOS.                                                       |
| **Same payments** | Stripe on both; organizers see unified revenue.                                    |
| **Same tools**    | Organizers can run the full workflow from web or iPhone, according to preference. |

---

## Part 4: At a glance — web vs iOS

| Area                 | Web                                   | iOS (iPhone)                                      |
| -------------------- | ------------------------------------- | ------------------------------------------------- |
| **Best for**         | Discovery via search & sharing links  | Pocket wallet, push alerts, camera at the door    |
| **Design**           | Established layout + refresh in progress | Dark, mobile-first Flame design                |
| **Payments**         | Stripe (cards, etc. as configured)      | Stripe + **Apple Pay** in the native sheet        |
| **Ticket access**    | Email + account in browser            | Email + **wallet + QR in app**                    |
| **Scanner**          | Browser camera                        | Native camera experience                          |
| **Notifications**    | Email                                 | **Email + push** and in-app notification list     |
| **Organizer work**   | Full desk workflow                    | **Full workflow on the phone** (create, RSVP, team, door) |

---

## Summary

**Flame today** is a **two-front-door** ticketing platform: a **production website** and a **native iOS app**, both powered by **Stripe** and **Stripe Connect**, with deep support for attendees (including RSVP, codes, and custom questions) and for organizers (including **teams, per-event assignments, co-host organizations**, sales, exports, and door check-in).

The **shared backend** means improvements and new capabilities can reach **both** web and mobile users together.
