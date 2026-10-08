/**
 * Utility functions for transforming bank transfer orders to match promotional ticket structure
 */

interface BankTransferOrder {
  id: string;
  // W7-H2 (3b): null for no-account orders (the recipient identity lives in
  // customer_email / customer_name instead).
  user_id: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  quantity: number;
  total_amount_cents: number | null;
  created_at: string;
  status: string;
  payment_provider: string;
  users?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  }>;
  ticket_tiers?: {
    id: string;
    name: string;
    price_cents: number;
  } | Array<{
    id: string;
    name: string;
    price_cents: number;
  }>;
  tickets?: Array<{
    id: string;
    qr_token: string | null;
    checked_in_at: string | null;
    metadata: Record<string, unknown> | null;
  }>;
}

interface TransformedBankTransferTicket {
  id: string;
  email: string;
  customer_name: string;
  status: string;
  created_at: string;
  checked_in_at: string | null;
  qr_token: string | null;
  metadata: Record<string, unknown> | null;
  ticket_tiers: {
    id: string;
    name: string;
    price_cents: number;
  };
  order_total_cents: number | null;
  order_quantity: number;
  is_bank_transfer: true;
}

interface EventWithBankTransfersInput {
  bank_transfer_orders?: BankTransferOrder[] | null;
  [key: string]: unknown;
}

interface EventWithBankTransfersOutput {
  bank_transfer_orders?: TransformedBankTransferTicket[];
  [key: string]: unknown;
}

/**
 * Type guard to check if an order is a BankTransferOrder (not already transformed)
 */
function isBankTransferOrder(
  order: BankTransferOrder | TransformedBankTransferTicket
): order is BankTransferOrder {
  return 'payment_provider' in order && !('is_bank_transfer' in order);
}

/**
 * Transforms bank transfer orders to match promotional ticket structure for display
 * @param events - Array of events that may contain bank_transfer_orders (BankTransferOrder[])
 * @returns Array of events with bank_transfer_orders transformed to promotional ticket format
 */
export function transformBankTransferOrders(
  events: EventWithBankTransfersInput[]
): EventWithBankTransfersOutput[] {
  return events.map((event) => {
    // Initialize bank_transfer_orders as empty array if it doesn't exist
    if (!event.bank_transfer_orders) {
      return {
        ...event,
        bank_transfer_orders: [],
      };
    }

    // Type guard: filter to only untransformed BankTransferOrder items
    // This ensures the function is idempotent and type-safe
    const untransformedOrders = event.bank_transfer_orders.filter(isBankTransferOrder);

    // Filter to only bank transfer orders with completed status and transform structure
    const transformedOrders: TransformedBankTransferTicket[] = untransformedOrders
      .filter((order) => order.payment_provider === "bank_transfer" && order.status === "completed")
      .map((order): TransformedBankTransferTicket => {
        // Normalize nested arrays/objects (users, ticket_tiers, tickets)
        const user = Array.isArray(order.users) ? order.users[0] : order.users;
        const ticketTier = Array.isArray(order.ticket_tiers)
          ? order.ticket_tiers[0]
          : order.ticket_tiers;
        const firstTicket = Array.isArray(order.tickets)
          ? order.tickets[0]
          : order.tickets?.[0];

        // Build customer name with null-safety. For no-account orders (3b) there
        // is no `users` join — fall back to the order's customer_name/email.
        const customerName = user
          ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email
          : order.customer_name?.trim() || order.customer_email || "Unknown";

        return {
          id: order.id,
          email: user?.email || order.customer_email || "",
          customer_name: customerName,
          status: order.status,
          created_at: order.created_at,
          checked_in_at: firstTicket?.checked_in_at || null,
          qr_token: firstTicket?.qr_token || null,
          metadata: firstTicket?.metadata || null,
          ticket_tiers: ticketTier || {
            id: "",
            name: "Unknown",
            price_cents: 0,
          },
          // Store order data for cost display
          order_total_cents: order.total_amount_cents,
          order_quantity: order.quantity,
          is_bank_transfer: true, // Flag to identify bank transfer orders
        };
      });

    return {
      ...event,
      bank_transfer_orders: transformedOrders,
    };
  });
}

