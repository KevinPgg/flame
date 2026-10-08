import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

// Types for Contact Form
interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  honeypot: string;
}

interface ContactFormResponse {
  message: string;
}

// Types for Organization Creation
interface CreateOrganizationData {
  name: string;
  slug: string;
}

interface CreateOrganizationResponse {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  owner_user_id: string;
}

// Types for Event Creation
interface TicketStage {
  name: string;
  price_cents: number;
  quantity: number;
}

interface TicketTier {
  name: string;
  price_cents: number;
  quantity_total: number;
  per_user_limit: number;
  /** ISO datetime string or null when omitted (server defaults to now). */
  sales_start: string | null;
  sales_end: string;
  useStages: boolean;
  stages: TicketStage[];
  secret_code?: string | null;
}

interface CreateEventData {
  event: {
    name: string;
    slug: string;
    city: string;
    venue: string;
    starts_at: string;
    ends_at: string;
    description: string;
    image_url: string;
    status: "published";
    organization_id: string;
  };
  ticket_tiers: TicketTier[];
}

interface CreateEventResponse {
  event: {
    id: string;
    name: string;
    slug: string;
  };
  message: string;
}

// Hook for Contact Form submission
export function useContactForm() {
  return useMutation<ContactFormResponse, Error, ContactFormData>({
    mutationFn: async formData => {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: formData.subject.trim(),
          message: formData.message.trim(),
          honeypot: formData.honeypot,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send message");
      }

      return response.json();
    },
    onSuccess: () => {
      console.log("✅ Contact form submitted successfully");
    },
    onError: error => {
      console.error("❌ Failed to submit contact form:", error.message);
    },
  });
}

// Hook for Organization Creation
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<CreateOrganizationResponse, Error, CreateOrganizationData>(
    {
      mutationFn: async formData => {
        const response = await fetch("/api/organizations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create organization");
        }

        return response.json();
      },
      onSuccess: data => {
        // Invalidate organizations query to refresh user's organization status
        queryClient.invalidateQueries({
          queryKey: ["organizations"],
        });

        console.log("✅ Organization created successfully:", data.name);
      },
      onError: error => {
        console.error("❌ Failed to create organization:", error.message);
      },
    }
  );
}

// Hook for Event Creation
export function useCreateEvent() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<CreateEventResponse, Error, CreateEventData>({
    mutationFn: async eventData => {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create event");
      }

      return response.json();
    },
    onSuccess: data => {
      // Invalidate events query to show the new event
      queryClient.invalidateQueries({
        queryKey: ["events"],
      });

      console.log("✅ Event created successfully:", data.event.name);

      // Navigation is now handled by the component's onSuccess callback
      // This allows the component to show success UI before navigating
    },
    onError: error => {
      console.error("❌ Failed to create event:", error.message);
    },
  });
}

// Export types for use in components
export type {
  ContactFormData,
  ContactFormResponse,
  CreateOrganizationData,
  CreateOrganizationResponse,
  CreateEventData,
  CreateEventResponse,
  TicketTier,
  TicketStage,
};
