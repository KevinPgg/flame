"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  FiCheckCircle,
  FiCalendar,
  FiTag,
  FiAlertCircle,
} from "react-icons/fi";
import Image from "next/image";
import Link from "next/link";
import { formatCentsAsPrice } from "@project-flame/lib";

interface OrderDetails {
  id: string;
  status: string;
  quantity: number;
  total_cents: number;
  subtotal_cents: number;
  fees_cents?: number;
  discount_amount_cents: number;
  fee_percentage?: number | null;
  created_at?: string;
  event: {
    id: string;
    name: string;
    slug: string;
    starts_at: string;
    ends_at: string;
    venue: string;
    city: string;
    image_url: string;
    currency?: string;
    organization: {
      name: string;
    };
  };
  ticket_tier: {
    id: string;
    name: string;
    price_cents: number;
  };
  promotional_code?: {
    id: string;
    code: string;
    discount_percentage: number;
  } | null;
  tickets: Array<{
    id: string;
    attendee_name: string;
    attendee_email: string;
    qr_code: string;
    qr_token: string;
    status: string;
    checked_in_at: string | null;
    created_at: string;
  }>;
}

function PurchaseSuccessContent() {
  const searchParams = useSearchParams();
  const orderId =
    searchParams.get("order_id") ||
    searchParams.get("pi") ||
    searchParams.get("payment_intent");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);

  useEffect(() => {
    console.log("Success page loaded with orderId:", orderId);
    console.log(
      "All search params:",
      Object.fromEntries(searchParams.entries())
    );

    if (orderId) {
      fetchOrderDetails();
    } else {
      console.log("No orderId found in URL");
      setLoading(false);
    }
  }, [orderId]);

  const fetchOrderDetails = async (retryCount = 0) => {
    try {
      console.log(`Fetching order details for orderId: ${orderId} (Attempt ${retryCount + 1})`);
      const response = await fetch(`/api/orders/${orderId}`);
      const data = await response.json();

      console.log("API Response:", { status: response.status, data });

      if (!response.ok) {
        if (response.status === 404 && retryCount < 5) {
          const delay = Math.min(1000 * Math.pow(1.5, retryCount), 5000);
          console.log(`Order not found, retrying in ${delay}ms...`);
          setTimeout(() => fetchOrderDetails(retryCount + 1), delay);
          return;
        }

        console.error("API Error:", data.error);
        setError(data.error || "Failed to load order details");
        setLoading(false);
        return;
      }

      console.log("Order details received:", data.order);
      setOrderDetails(data.order);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching order details:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load order details. Please try refreshing the page."
      );
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100" />
          <p className="text-white-50 text-sm font-poppins-light">Confirming your purchase...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-white-5 border border-white-20 rounded-card p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[rgba(234,51,112,0.1)] flex items-center justify-center">
            <FiAlertCircle size={32} className="text-error" />
          </div>
          <h1 className="text-white-100 text-xl font-poppins-semibold m-0">Purchase Verification Error</h1>
          <p className="text-white-50 text-sm font-poppins-light m-0">{error}</p>
          <Link
            href="/"
            className="bg-white-100 text-dark rounded-pill px-6 py-3 font-poppins-semibold text-sm no-underline inline-flex items-center justify-center"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!orderDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-white-5 border border-white-20 rounded-card p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[rgba(234,51,112,0.1)] flex items-center justify-center">
            <FiAlertCircle size={32} className="text-error" />
          </div>
          <h1 className="text-white-100 text-xl font-poppins-semibold m-0">Order Not Found</h1>
          <p className="text-white-50 text-sm font-poppins-light m-0">We couldn&#39;t find your order details. Please check your account for your tickets.</p>
          <Link
            href="/account"
            className="bg-white-100 text-dark rounded-pill px-6 py-3 font-poppins-semibold text-sm no-underline inline-flex items-center justify-center"
          >
            View My Tickets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-[600px] mx-auto flex flex-col gap-6">
        {/* Success Header */}
        <div className="text-center flex flex-col items-center gap-4 py-6">
          <div className="w-16 h-16 rounded-full bg-[#5DDBB1]/20 flex items-center justify-center">
            <FiCheckCircle size={32} className="text-[#5DDBB1]" />
          </div>
          <h1 className="text-white-100 text-2xl font-poppins-semibold m-0">Purchase Successful!</h1>
          <p className="text-white-50 text-sm font-poppins-light m-0 max-w-sm">
            Your tickets have been generated with QR codes for event entry.
          </p>
        </div>

        {/* Order Details */}
        {orderDetails && (
          <div className="bg-white-5 rounded-card p-4 flex flex-col gap-4">
            <h2 className="text-white-100 text-lg font-poppins-semibold m-0">Order Summary</h2>

            {/* Event Info */}
            <div className="flex gap-4">
              <div className="w-[120px] h-[160px] rounded-card overflow-hidden shrink-0">
                <Image
                  src={orderDetails.event.image_url}
                  alt={orderDetails.event.name}
                  width={120}
                  height={160}
                  sizes="120px"
                  className="object-cover w-full h-full"
                />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-white-100 text-base font-poppins-semibold m-0 uppercase">
                  {orderDetails.event.name}
                </h3>
                <p className="text-white-50 text-xs font-poppins-light m-0">
                  by {orderDetails.event.organization.name}
                </p>
                <p className="text-white-80 text-xs font-poppins-light m-0 mt-1">
                  {formatDate(orderDetails.event.starts_at)}
                </p>
                <p className="text-white-80 text-xs font-poppins-light m-0">
                  {orderDetails.event.venue}, {orderDetails.event.city}
                </p>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="flex flex-col gap-2 pt-4 border-t border-white-10">
              {(() => {
                const eventCurrency = orderDetails.event.currency ?? "USD";
                const hasDiscount =
                  orderDetails.promotional_code &&
                  orderDetails.discount_amount_cents > 0;
                const promoCode = orderDetails.promotional_code;
                const originalTotal =
                  orderDetails.subtotal_cents +
                  (orderDetails.fees_cents ?? 0);

                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-white-50 text-sm font-poppins">Original total</span>
                      <span className="text-white-100 text-sm font-poppins">
                        {formatCentsAsPrice(originalTotal, eventCurrency)}
                      </span>
                    </div>

                    {hasDiscount && promoCode && (
                      <div className="flex justify-between items-center">
                        <span className="text-[#5DDBB1] text-sm font-poppins">
                          Discount ({promoCode.code} - {promoCode.discount_percentage}%)
                        </span>
                        <span className="text-[#5DDBB1] text-sm font-poppins">
                          -{formatCentsAsPrice(orderDetails.discount_amount_cents, eventCurrency)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs pt-2">
                      <span className="text-white-50 font-poppins">Ticket price</span>
                      <span className="text-white-80 font-poppins">
                        {formatCentsAsPrice(
                          hasDiscount
                            ? orderDetails.subtotal_cents - orderDetails.discount_amount_cents
                            : orderDetails.subtotal_cents,
                          eventCurrency
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-white-50 font-poppins">Service fee</span>
                      <span className="text-white-80 font-poppins">
                        {formatCentsAsPrice(orderDetails.fees_cents ?? 0, eventCurrency)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-white-10">
                      <span className="text-white-100 text-lg font-poppins-semibold">You paid</span>
                      <span className="text-white-100 text-lg font-poppins-semibold">
                        {formatCentsAsPrice(orderDetails.total_cents, eventCurrency)}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Tickets with QR Codes */}
        {orderDetails?.tickets && orderDetails.tickets.length > 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-white-100 text-lg font-poppins-semibold m-0">Your Tickets</h2>
            {orderDetails.tickets.map((ticket, index) => (
              <div key={ticket.id} className="bg-white-5 rounded-card overflow-hidden">
                <div className="p-4 border-b border-white-10">
                  <h4 className="text-white-100 text-sm font-poppins-semibold m-0">
                    Ticket #{index + 1}
                  </h4>
                  <p className="text-white-50 text-xs font-poppins-light m-0 mt-1">
                    {ticket.attendee_name}
                  </p>
                  <p className="text-primary text-xs font-poppins-medium m-0 mt-1">
                    {orderDetails.ticket_tier.name}
                  </p>
                </div>

                <div className="p-6 flex flex-col items-center gap-3">
                  {ticket.qr_code && (
                    <div className="bg-white rounded-card p-4">
                      <Image
                        src={ticket.qr_code}
                        alt={`QR Code for ticket ${index + 1}`}
                        width={200}
                        height={200}
                        sizes="200px"
                        className="object-cover w-full h-full"
                      />
                    </div>
                  )}
                  <p className="text-white-50 text-xs font-poppins-light m-0 text-center">
                    Present this QR code at the event entrance
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Next Steps */}
        <div className="flex flex-col gap-4">
          <h2 className="text-white-100 text-lg font-poppins-semibold m-0">What&#39;s Next?</h2>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0 mt-0.5">
                <FiTag size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="text-white-100 text-sm font-poppins-semibold m-0">Save Your Tickets</h3>
                <p className="text-white-50 text-xs font-poppins-light m-0 mt-1 leading-5">
                  Screenshot or check your email for your tickets with QR codes.
                  You&#39;ll need to present them at the event entrance for check-in.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0 mt-0.5">
                <FiCalendar size={18} className="text-[#8b5cf6]" />
              </div>
              <div>
                <h3 className="text-white-100 text-sm font-poppins-semibold m-0">Mark Your Calendar</h3>
                <p className="text-white-50 text-xs font-poppins-light m-0 mt-1 leading-5">
                  Don&#39;t forget to add the event to your calendar. Arrive a few
                  minutes early for a smooth check-in experience.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-[#FBD68D]/10 border border-[#FBD68D]/30 rounded-card p-4">
          <h3 className="text-[#FBD68D] text-sm font-poppins-semibold m-0 mb-2">Important Information</h3>
          <ul className="text-[#FBD68D]/80 text-xs font-poppins-light m-0 pl-4 flex flex-col gap-1 leading-5">
            <li>Keep your QR codes safe and don&#39;t share them with others</li>
            <li>Each ticket is valid for one person only</li>
            <li>Bring a valid ID that matches the ticket holder&#39;s name</li>
            <li>Contact the event organizer if you have any questions</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Link
            href="/discover"
            className="bg-white-100 text-dark rounded-pill px-6 py-4 font-poppins-semibold text-sm no-underline text-center"
          >
            Browse More Events
          </Link>
          <Link
            href="/account"
            className="bg-transparent border border-white-30 text-white-100 rounded-pill px-6 py-3 font-poppins-medium text-sm no-underline text-center"
          >
            View My Tickets
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100" />
        <p className="text-white-50 text-sm font-poppins-light">Loading...</p>
      </div>
    </div>
  );
}

export default function PurchaseSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PurchaseSuccessContent />
    </Suspense>
  );
}
