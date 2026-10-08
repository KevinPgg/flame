import type { Metadata } from "next";
import { Navbar, Footer } from "../components";
import { generateMetadata as generateSEOMetadata } from "../lib/seo-config";
import FAQsClient from "./FAQsClient";
import Link from "next/link";

export const metadata: Metadata = generateSEOMetadata({
  title: "Frequently Asked Questions",
  description:
    "Find answers to common questions about Flame ticketing, event purchases, refunds, and more. Get help with your event ticketing needs.",
  url: "/faqs",
});

export default function FAQsPage() {
  const faqSections = [
    {
      title: "Getting Started",
      faqs: [
        {
          question: "What is FLAME?",
          answer:
            "FLAME is a digital ticketing platform that connects event organizers with attendees. We provide a secure, easy-to-use platform for purchasing tickets to concerts, festivals, workshops, and other events.",
        },
        {
          question: "How do I create an account?",
          answer:
            "You can create an account by signing up through our website or mobile app. You'll need to provide your email address and create a password. We recommend using a valid email address as this is where your tickets will be delivered.",
        },
        {
          question: "How do I create an event?",
          answer:
            "To create an event on FLAME, you'll need to sign up for an organizer account. Once registered, you can access the organizer dashboard to create and manage your events from the website or mobile app. For paid events, you'll need to connect a Stripe account to receive payouts — the platform will guide you through the setup process. For questions about fees or custom arrangements, reach out to support@flme.co or call +593 (04) 2510 9060.",
        },
      ],
    },
    {
      title: "Privacy & Security",
      faqs: [
        {
          question: "Is my personal information safe?",
          answer:
            "Yes, we take data privacy seriously. Your personal information is protected under our Privacy Policy and applicable data protection laws. We only collect information necessary for processing purchases and providing our services. We do not store credit card information.",
        },
        {
          question: "What should I do if I suspect fraudulent activity?",
          answer:
            "Contact our support team immediately at support@flme.co. We take fraud prevention seriously and will investigate any suspicious activity.",
        },
      ],
    },
    {
      title: "Purchasing Tickets",
      faqs: [
        {
          question: "How do I purchase tickets?",
          answer:
            "Browse events on our platform, select your tickets, and complete the secure checkout process. You'll receive confirmation and your digital tickets via email within 24 hours of payment confirmation.",
        },
        {
          question: "What payment methods do you accept?",
          answer:
            "We accept various secure payment methods including credit cards, debit cards, and other payment options available through our payment partners.",
        },
        {
          question: "What currencies do you accept?",
          answer:
            "We process payments in USD and other currencies as available through our payment partners. Prices are displayed in the local currency where applicable.",
        },
        {
          question: "Can I buy tickets for multiple events at once?",
          answer:
            "Yes, you can purchase tickets for different events in separate transactions. Each event purchase is processed individually.",
        },
      ],
    },
    {
      title: "Ticket Management",
      faqs: [
        {
          question: "When will I receive my tickets?",
          answer:
            "Digital tickets are typically sent immediately after payment confirmation, or within 24 hours at most. Check your email inbox, spam, and promotions folders. You can also download tickets from your account.",
        },
        {
          question: "How do I use my digital ticket?",
          answer:
            "Present your digital ticket (with QR code) on your mobile device at the event entrance, or print it if allowed by the organizer. Each ticket can only be used once - once scanned, it becomes invalid.",
        },
        {
          question: "I didn't receive my tickets. What should I do?",
          answer:
            "Check your email inbox, spam, and promotions folders. If you still can't find them, contact our support team at support@flme.co or call +593 (04) 2510 9060. We'll resend your tickets to your registered email address.",
        },
        {
          question: "What if I lose my digital ticket?",
          answer:
            "Contact our support team immediately. We'll help you recover your ticket from your account. Never share your tickets publicly to avoid loss or theft.",
        },
        {
          question: "Can I transfer my tickets to someone else?",
          answer:
            "Tickets are non-transferable unless specifically authorized by the event organizer. Each ticket is linked to the purchaser's account for security and verification purposes.",
        },
        {
          question: "How long do tickets remain valid?",
          answer:
            "Tickets are valid for the specific event date and time listed. They expire after the event concludes.",
        },
        {
          question: "Do you offer mobile tickets?",
          answer:
            "Yes! You can access and display your tickets directly from our mobile app, making it easy to enter events without printing.",
        },
      ],
    },
    {
      title: "Refunds & Event Issues",
      faqs: [
        {
          question: "Can I get a refund if I can't attend the event?",
          answer:
            "Refunds are only available in cases of event cancellation by the organizer due to force majeure or other authorized circumstances. Personal inability to attend does not qualify for refunds. Please check each event's specific policies.",
        },
        {
          question: "What happens if an event is canceled?",
          answer:
            "If an event is canceled, the organizer is responsible for issuing refunds directly through their payment provider. FLAME can help connect you with the organizer and provide transaction records to support the refund process. Contact us at support@flme.co if you need assistance with a canceled event.",
        },
        {
          question: "Can I change my ticket after purchase?",
          answer:
            "Changes to tickets (date, time, quantity) are generally not allowed unless authorized by the event organizer. All purchases are final.",
        },
      ],
    },
    {
      title: "For Organizers",
      faqs: [
        {
          question: "How do organizers get paid?",
          answer:
            "Organizers connect their own Stripe account through the FLAME platform. Ticket sale proceeds flow directly from the buyer to the organizer's Stripe account — FLAME never holds funds. Payouts are processed on a weekly basis through Stripe. For details, see our Organizer Agreement.",
        },
        {
          question: "What are the fees for organizers?",
          answer:
            "FLAME charges a service fee of 10% of the ticket price plus $0.99 per ticket, paid entirely by the ticket buyer at checkout. Organizers receive the full face value of each ticket at the price they set. FLAME does not deduct any amount from the organizer's ticket revenue.",
        },
        {
          question: "Who is responsible for refunds?",
          answer:
            "The organizer is fully responsible for all refunds, chargebacks, and disputes related to their events. Since funds go directly to the organizer's Stripe account, refunds are processed by the organizer through Stripe. FLAME can provide transaction records to support the process.",
        },
        {
          question: "What is the service fee for?",
          answer:
            "The service fee covers platform maintenance, payment processing, customer support, and other operational costs. This fee is non-refundable and helps us provide a secure, reliable ticketing service.",
        },
        {
          question: "Are events on FLAME insured or guaranteed?",
          answer:
            "Event organizers are solely responsible for the execution and success of their events. FLAME LLC acts only as a technology provider and ticketing intermediary. We recommend reviewing event details and organizer information before purchasing.",
        },
      ],
    },
    {
      title: "General",
      faqs: [
        {
          question: "How do I contact event organizers?",
          answer:
            "For questions about specific events, contact information is usually available on the event page. For platform-related issues, contact our support team.",
        },
        {
          question: "How do I update my account information?",
          answer:
            "You can update your account information through your profile settings on the website or mobile app. Keep your email address current to ensure ticket delivery.",
        },
        {
          question: "Are there age restrictions for events?",
          answer:
            "Age restrictions vary by event and are determined by the organizers. Please check event details before purchasing tickets.",
        },
        {
          question: "How do I report a problem with an event?",
          answer:
            "For event-related issues, contact the organizer directly. For platform issues, contact our support team at support@flme.co or +593 (04) 2510 9060.",
        },
        {
          question: "What if I have accessibility needs?",
          answer:
            "Contact event organizers directly regarding accessibility accommodations. We're committed to making events accessible and can help connect you with organizers.",
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-12">
          <h1 className="text-2xl leading-8 font-poppins-semibold text-white-100 mb-3">
            Frequently Asked Questions
          </h1>
          <p className="text-sm leading-[22px] font-poppins text-white-80 mb-10">
            Find answers to common questions about FLAME, our ticketing platform,
            and event purchases. Can't find what you're looking for?{" "}
            <Link
              href="/contact"
              className="text-white-100 underline hover:text-white-80 transition-colors"
            >
              Contact our support team
            </Link>
            .
          </p>

          <FAQsClient faqSections={faqSections} />

          <div className="bg-white-5 border border-white-20 rounded-card p-8 text-center mt-4">
            <h3 className="text-lg font-poppins-semibold text-white-100 mb-4">
              Still need help?
            </h3>
            <Link
              href="/contact"
              className="inline-block bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity text-sm"
            >
              Get in touch
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
