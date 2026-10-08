/**
 * Shared FAQ content for web and mobile.
 * Curated subset of web FAQs (see apps/web/app/faqs/page.tsx).
 */

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export const faqs: FAQItem[] = [
  {
    id: "faq-1",
    question: "What is FLAME?",
    answer:
      "FLAME is a digital ticketing platform that connects event organizers with attendees. We provide a secure, easy-to-use platform for purchasing tickets to concerts, festivals, workshops, and other events.",
  },
  {
    id: "faq-2",
    question: "How do I purchase tickets?",
    answer:
      "Browse events on our platform, select your tickets, and complete the secure checkout process. You'll receive confirmation and your digital tickets via email within 24 hours of payment confirmation.",
  },
  {
    id: "faq-3",
    question: "How do I use my digital ticket?",
    answer:
      "Present your digital ticket (with QR code) on your mobile device at the event entrance. Each ticket can only be used once — once scanned, it becomes invalid.",
  },
  {
    id: "faq-4",
    question: "What payment methods do you accept?",
    answer:
      "We accept various secure payment methods including credit cards, debit cards, and other payment options available through our payment partners.",
  },
  {
    id: "faq-5",
    question: "Can I get a refund if I can't attend?",
    answer:
      "Refunds are only available in cases of event cancellation by the organizer due to force majeure or other authorized circumstances. Personal inability to attend does not qualify for refunds. Please check each event's specific policies.",
  },
  {
    id: "faq-6",
    question: "What is the service fee for?",
    answer:
      "The service fee covers platform maintenance, payment processing, customer support, and other operational costs. This fee is non-refundable and helps us provide a secure, reliable ticketing service.",
  },
  {
    id: "faq-7",
    question: "What are the fees for organizers?",
    answer:
      "FLAME charges a service fee of 10% of the ticket price plus $0.99 per ticket, paid entirely by the ticket buyer at checkout. Organizers receive the full face value of each ticket.",
  },
  {
    id: "faq-8",
    question: "What happens if an event is canceled?",
    answer:
      "If an event is canceled, the organizer is responsible for issuing refunds directly through their payment provider. Contact us at support@flme.co if you need assistance.",
  },
];
