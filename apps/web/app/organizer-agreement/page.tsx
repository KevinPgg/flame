"use client";

import { Navbar, Footer } from "../components";

const proseClasses =
  "[&_h1]:text-2xl [&_h1]:leading-8 [&_h1]:font-poppins-semibold [&_h1]:text-white-100 [&_h1]:mb-6 " +
  "[&_h2]:text-lg [&_h2]:font-poppins-semibold [&_h2]:text-white-100 [&_h2]:mt-8 [&_h2]:mb-3 " +
  "[&_h3]:text-base [&_h3]:font-poppins-semibold [&_h3]:text-white-100 [&_h3]:mt-6 [&_h3]:mb-2 " +
  "[&_p]:text-sm [&_p]:leading-[22px] [&_p]:font-poppins [&_p]:text-white-80 [&_p]:mb-3 " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 " +
  "[&_li]:text-sm [&_li]:leading-[22px] [&_li]:font-poppins [&_li]:text-white-80 [&_li]:mb-1 " +
  "[&_strong]:text-white-100 [&_strong]:font-poppins-semibold " +
  "[&_a]:text-white-100 [&_a]:underline [&_a]:transition-colors";

export default function OrganizerAgreementPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-12">
          <div className={proseClasses}>
            <h1>ORGANIZER AGREEMENT</h1>
            <p>
              <strong>Last Updated: March 31, 2026</strong>
            </p>

            <p>
              This Organizer Agreement (the &quot;Agreement&quot;) is entered into between
              FLAME LLC, a limited liability company organized under the laws of
              the State of Florida, United States of America (&quot;FLAME&quot;), and the
              event organizer or entity registering on the Platform
              (&quot;Organizer&quot;).
            </p>

            <p>
              By creating an Organizer account, listing an event, or using
              FLAME&apos;s services, the Organizer agrees to be bound by this
              Agreement.
            </p>

            <h2>1. Purpose of the Agreement</h2>

            <p>
              FLAME provides a technology platform that enables Organizers to
              create, promote, and sell tickets for events.
            </p>
            <p>
              FLAME facilitates the technical connection between the
              Organizer&apos;s Stripe account and the Platform to enable ticket
              sales. FLAME does not act as a payment processor or hold funds on
              behalf of the Organizer.
            </p>
            <p>
              FLAME is not the owner, promoter, or organizer of any event listed
              on the Platform.
            </p>

            <h2>2. Organizer Responsibilities</h2>

            <p>The Organizer is solely responsible for:</p>
            <ul>
              <li>Planning, organizing, and executing events</li>
              <li>
                Ensuring event accuracy (date, time, location, description)
              </li>
              <li>Obtaining all licenses, permits, and authorizations</li>
              <li>Compliance with all applicable laws and regulations</li>
              <li>Health, safety, and security at the event</li>
            </ul>
            <p>
              The Organizer guarantees that all information provided is accurate
              and not misleading.
            </p>

            <h2>3. Ticket Sales &amp; Merchant Responsibility</h2>

            <p>
              The Organizer is the sole seller and merchant of record for all
              tickets sold through the Platform. All ticket sales are
              transactions between the User and the Organizer.
            </p>
            <p>
              FLAME acts only as a technology provider, facilitating the
              connection between the Organizer&apos;s Stripe account and the
              Platform. FLAME does not hold, receive, or have custody of any
              funds at any point in the transaction.
            </p>
            <p>
              The Organizer receives the full face value of each ticket at the
              price they set. FLAME does not deduct any amount from the
              Organizer&apos;s ticket revenue. The FLAME service fee is charged
              separately to the User at checkout and does not reduce or affect
              the amount the Organizer receives.
            </p>

            <h2>4. Fees and Pricing</h2>

            <p>
              FLAME charges a service fee per transaction, which is paid entirely
              by the User (ticket buyer) and added to the final purchase price at
              checkout.
            </p>
            <p>
              The standard service fee consists of 10% of the ticket price plus
              $0.99 per ticket, and is clearly displayed to the User before
              completing the purchase.
            </p>
            <p>
              FLAME does not deduct its service fee from the Organizer&apos;s
              ticket revenue. The Organizer receives the full ticket face value,
              except for any payment processing fees, chargebacks, refunds, or
              other costs explicitly outlined in this Agreement.
            </p>

            <h3>Custom Fee Arrangements</h3>
            <p>
              An Organizer may submit a written request to FLAME to negotiate a
              custom service fee rate. FLAME retains sole and absolute discretion
              to accept or decline any such request, and is under no obligation
              to grant a reduced or modified fee rate to any Organizer. Any
              approved custom fee arrangement must be confirmed in writing by
              FLAME prior to taking effect and will apply only to the specific
              Organizer and events for which it was approved. Custom fee
              arrangements do not affect the fees charged to other Organizers on
              the Platform.
            </p>
            <p>
              FLAME reserves the right to modify its service fees at any time,
              with such changes applying only to future transactions and being
              clearly communicated prior to purchase.
            </p>

            <h2>5. Payment Processing and Payouts</h2>

            <h3>5.1 Payment Processor</h3>
            <p>
              All payments are processed through Stripe, Inc. (&quot;Stripe&quot;), a
              third-party payment processor. Organizers connect their own Stripe
              account directly through the FLAME platform to receive payments. By
              connecting a Stripe account, the Organizer agrees to be bound by
              Stripe&apos;s applicable terms, including the Stripe Connected
              Account Agreement and the Stripe Services Agreement, currently
              available at{" "}
              <a
                href="https://stripe.com/legal/connect-account"
                target="_blank"
                rel="noopener noreferrer"
              >
                stripe.com/legal/connect-account
              </a>
              , as amended by Stripe from time to time (collectively, the
              &quot;Stripe Agreements&quot;). In the event of any conflict between this
              Agreement and the Stripe Agreements with respect to payment
              processing, the Stripe Agreements shall govern.
            </p>
            <p>
              Ticket sale proceeds flow directly from the User to the
              Organizer&apos;s connected Stripe account. FLAME does not hold,
              receive, or have custody of any funds at any point in the
              transaction. FLAME&apos;s role is limited to facilitating the
              technical connection between the Organizer&apos;s Stripe account
              and the Platform.
            </p>

            <h3>5.2 Stripe Identity Verification &amp; KYC</h3>
            <p>
              The Organizer is required to complete Stripe&apos;s identity
              verification and Know Your Customer (&quot;KYC&quot;) process as a condition
              of receiving payouts. The Organizer must provide accurate,
              complete, and up-to-date information, which may include:
            </p>
            <ul>
              <li>Legal name and date of birth</li>
              <li>Government-issued identification</li>
              <li>Business registration documents (if applicable)</li>
              <li>Bank account or payment account information</li>
              <li>Tax identification numbers</li>
            </ul>
            <p>
              The Organizer is not entitled to receive any payments from ticket
              sales unless and until Stripe&apos;s verification process is
              successfully completed. FLAME reserves the right to withhold
              payouts if the Organizer&apos;s identity information is inaccurate,
              incomplete, or fails Stripe&apos;s verification requirements.
            </p>

            <h3>5.3 Stripe as Independent Party</h3>
            <p>
              Stripe operates as an independent third party and makes its own
              determinations regarding account approvals, transaction approvals,
              fund holds, and account suspensions. FLAME does not control
              Stripe&apos;s decisions and shall not be liable for any action or
              inaction by Stripe, including but not limited to:
            </p>
            <ul>
              <li>
                Denial or suspension of the Organizer&apos;s Stripe Connected
                Account
              </li>
              <li>
                Delays or holds placed on payouts by Stripe&apos;s risk or
                compliance teams
              </li>
              <li>
                Refusal to process specific transactions based on Stripe&apos;s
                internal policies
              </li>
              <li>
                Changes to Stripe&apos;s terms, fees, or eligibility
                requirements
              </li>
            </ul>
            <p>
              If Stripe refuses to facilitate payments to or engage in services
              involving an Organizer, FLAME may suspend or terminate the
              Organizer&apos;s access to the Platform with or without notice, and
              shall bear no liability for such suspension or termination.
            </p>

            <h3>5.3.1 FLAME Support in Stripe Disputes</h3>
            <p>
              In the event that an Organizer faces a fraud investigation, fund
              withholding, chargeback dispute, or any other conflict initiated by
              or involving Stripe, FLAME will provide reasonable assistance to
              the Organizer upon written request. Such assistance may include but
              is not limited to:
            </p>
            <ul>
              <li>
                Providing official confirmation that a ticket was sold through
                the FLAME platform or website
              </li>
              <li>
                Supplying transaction records, order details, timestamps, and
                buyer information as available in FLAME&apos;s system
              </li>
              <li>
                Issuing a written statement or documentation to support the
                Organizer&apos;s case with Stripe or any relevant financial
                institution
              </li>
            </ul>
            <p>
              FLAME will make reasonable efforts to respond to such requests in a
              timely manner. However, FLAME does not guarantee any specific
              outcome and shall not be liable for the result of any dispute,
              investigation, or claim handled by Stripe or any third party. The
              provision of documentation by FLAME does not constitute legal
              representation or financial liability of any kind.
            </p>

            <h3>5.4 Card Scheme Rules</h3>
            <p>
              The Organizer agrees to comply with all applicable rules and
              regulations of card payment networks, including but not limited to
              Visa, Mastercard, American Express, and Discover (collectively,
              &quot;Card Scheme Rules&quot;), as well as any applicable alternative
              payment frameworks. The Organizer acknowledges that:
            </p>
            <ul>
              <li>
                Stripe enforces Card Scheme Rules on all transactions processed
                through the Platform
              </li>
              <li>
                Violations of Card Scheme Rules may result in transaction
                declines, fines, or account termination
              </li>
              <li>
                FLAME shall not be liable for any consequences arising from the
                Organizer&apos;s failure to comply with Card Scheme Rules
              </li>
            </ul>

            <h3>5.5 Standard Payouts</h3>
            <p>
              Payouts to Organizers are processed on a weekly basis through
              Stripe. The payout schedule may be subject to processing times,
              banking delays, and Stripe&apos;s internal policies. FLAME LLC does
              not control the exact timing of fund transfers once released
              through Stripe and shall not be liable for delays caused by the
              payment processor or financial institutions.
            </p>

            <h3>5.6 Accelerated / Daily Payouts</h3>
            <p>
              Where available, Organizers may request accelerated or daily
              payouts through Stripe&apos;s payout infrastructure (including
              Stripe Connect features), subject to eligibility and approval. Such
              accelerated payouts may incur additional fees imposed by Stripe
              and/or FLAME, which will be communicated and agreed upon in
              advance. FLAME does not guarantee availability of accelerated
              payouts, as these depend on Stripe&apos;s policies, risk
              assessment, and geographic availability.
            </p>

            <h3>5.7 Custom / Enterprise Arrangements</h3>
            <p>
              For high-volume Organizers or strategic partners, customized payout
              structures may be arranged. Organizers may contact FLAME directly
              to discuss tailored payout schedules, fees, and settlement terms.
            </p>

            <h3>5.8 Risk &amp; Platform Restriction Rights</h3>
            <p>
              Because funds flow directly to the Organizer&apos;s connected
              Stripe account and are not held by FLAME, FLAME&apos;s risk
              controls are exercised through platform access restrictions rather
              than fund withholding. FLAME reserves the right to suspend,
              restrict, or terminate an Organizer&apos;s access to the Platform
              in cases including but not limited to:
            </p>
            <ul>
              <li>Suspected fraud or high-risk activity</li>
              <li>Chargebacks, disputes, or refund requests</li>
              <li>Compliance with legal or regulatory requirements</li>
              <li>Violation of this Agreement</li>
              <li>
                Failure to complete Stripe&apos;s KYC or identity verification
                process
              </li>
              <li>
                Stripe&apos;s independent decision to hold, delay, or refuse
                payouts
              </li>
            </ul>
            <p>
              In cases where Stripe independently holds or restricts funds in the
              Organizer&apos;s Stripe account, FLAME bears no liability for such
              actions as they are entirely within Stripe&apos;s control.
            </p>

            <h2>6. Chargebacks, Refunds, and Financial Liability</h2>

            <p>
              The Organizer is fully responsible for all chargebacks, refunds,
              disputes, and fraudulent transactions related to their events.
            </p>
            <p>
              In the event of an approved refund, the User shall receive the full
              amount paid for the ticket, including any applicable fees, in
              accordance with the Organizer&apos;s refund policy and applicable
              laws. Since funds are received directly by the Organizer through
              their connected Stripe account, all refunds are processed by the
              Organizer through Stripe.
            </p>
            <p>
              All disputes, chargebacks, or claims related to transactions shall
              be handled directly between the Organizer, the User, and Stripe,
              Inc. FLAME LLC is not a party to such disputes, does not hold any
              funds on behalf of the Organizer, and does not assume
              responsibility for the resolution of any financial claims.
            </p>
            <p>
              FLAME LLC may, upon request, provide transaction records,
              statements, or supporting documentation to assist in the resolution
              of disputes, but shall not be liable for the outcome of any claim,
              chargeback, or refund process.
            </p>
            <p>
              FLAME LLC reserves the right to suspend or restrict Organizer
              accounts and access to the Platform in cases of suspected fraud,
              abuse, or violation of this Agreement.
            </p>

            <h2>7. Event Cancellation</h2>

            <p>
              If an event is canceled, postponed, or significantly changed, the
              Organizer is solely responsible for:
            </p>
            <ul>
              <li>Notifying Users promptly</li>
              <li>
                Issuing refunds directly through their connected Stripe account
              </li>
            </ul>
            <p>
              Since funds are received directly by the Organizer through Stripe,
              FLAME does not process refunds on the Organizer&apos;s behalf. The
              Organizer is solely responsible for initiating and completing all
              refunds through their Stripe account. Failure to issue timely
              refunds may result in suspension or termination of the
              Organizer&apos;s access to the Platform.
            </p>

            <h2>8. Taxes</h2>

            <p>The Organizer is solely responsible for:</p>
            <ul>
              <li>Determining applicable taxes</li>
              <li>Collecting and remitting taxes</li>
              <li>Reporting income</li>
            </ul>
            <p>
              FLAME LLC is not responsible for any tax obligations of the
              Organizer.
            </p>

            <h2>9. Compliance, KYC, and Verification</h2>

            <p>FLAME reserves the right to request:</p>
            <ul>
              <li>Identity verification</li>
              <li>Business documentation</li>
              <li>Banking information</li>
            </ul>
            <p>
              FLAME may suspend or restrict accounts for failure to comply.
            </p>

            <h2>10. Prohibited Activities</h2>

            <p>The Organizer may not:</p>
            <ul>
              <li>List illegal events</li>
              <li>Sell fraudulent or misleading tickets</li>
              <li>Violate intellectual property rights</li>
              <li>Use the Platform for unlawful purposes</li>
            </ul>
            <p>
              FLAME may remove events or suspend accounts at its sole discretion.
            </p>

            <h2>11. Platform Rights</h2>

            <p>FLAME reserves the right to:</p>
            <ul>
              <li>Remove or modify event listings</li>
              <li>Suspend or terminate Organizer accounts</li>
              <li>
                Restrict platform access where risk or violations are identified
              </li>
            </ul>

            <h2>12. Indemnification</h2>

            <p>
              The Organizer agrees to indemnify and hold harmless FLAME, its
              officers, employees, and affiliates from any claims, damages,
              losses, or expenses arising from:
            </p>
            <ul>
              <li>The Organizer&apos;s events</li>
              <li>Violation of laws</li>
              <li>Breach of this Agreement</li>
            </ul>

            <h2>13. Limitation of Liability</h2>

            <p>FLAME shall not be liable for:</p>
            <ul>
              <li>Event execution failures</li>
              <li>Organizer misconduct</li>
              <li>Loss of profits or indirect damages</li>
            </ul>
            <p>
              FLAME&apos;s total liability shall not exceed the total fees earned
              from the Organizer in the previous 12 months or $100 USD.
            </p>

            <h2>14. Termination</h2>

            <p>
              FLAME may terminate this Agreement at any time. Upon termination:
            </p>
            <ul>
              <li>
                The Organizer&apos;s access to the Platform will be immediately
                revoked
              </li>
              <li>Outstanding liabilities remain payable</li>
              <li>
                Any funds held directly by Stripe in the Organizer&apos;s
                connected account remain subject to Stripe&apos;s own terms and
                policies
              </li>
            </ul>

            <h2>15. Force Majeure</h2>

            <p>
              FLAME shall not be liable for events beyond its control, including
              natural disasters, government actions, or payment system failures.
            </p>

            <h2>16. Governing Law and Dispute Resolution</h2>

            <p>
              This Agreement shall be governed by the laws of the State of
              Florida, United States. Any disputes shall be resolved through
              binding arbitration under the American Arbitration Association
              (AAA). No class actions permitted.
            </p>

            <h2>17. Entire Agreement</h2>

            <p>
              This Agreement constitutes the entire agreement between FLAME and
              the Organizer and supersedes all prior agreements.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
