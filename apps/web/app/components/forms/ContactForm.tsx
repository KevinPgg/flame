"use client";

import { useState } from "react";
import { useContactForm } from "../../lib/hooks/useForms";
import { contactSchema, type ContactFormData } from "../../lib/contact-schema";
import { FiSend, FiUser, FiMail, FiMessageCircle } from "react-icons/fi";

const inputClasses =
  "w-full bg-white-5 border border-white-20 rounded-card px-4 py-3 text-sm font-poppins text-white-100 placeholder:text-white-50 focus:outline-none focus:border-white-50 transition-colors";

const labelClasses =
  "flex items-center gap-2 text-xs font-poppins-medium text-white-50 mb-2 uppercase tracking-wider";

export default function ContactForm() {
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    subject: "",
    message: "",
    honeypot: "",
  });
  const [submitMessage, setSubmitMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const contactMutation = useContactForm();

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = (): string | null => {
    const result = contactSchema.safeParse({
      ...formData,
      email: formData.email.trim().toLowerCase(),
    });
    if (!result.success) {
      return result.error.issues[0]?.message ?? "Invalid form data";
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setSubmitMessage({ type: "error", text: validationError });
      return;
    }
    setSubmitMessage(null);
    const sanitizedEmail = formData.email.trim().toLowerCase();
    contactMutation.mutate({ ...formData, email: sanitizedEmail }, {
      onSuccess: () => {
        setSubmitMessage({
          type: "success",
          text: "Thank you! Your message has been sent. We'll get back to you within 24 hours.",
        });
        setFormData({ name: "", email: "", subject: "", message: "", honeypot: "" });
      },
      onError: error => {
        setSubmitMessage({
          type: "error",
          text: error.message || "Failed to send message. Please check your connection and try again.",
        });
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Honeypot - hidden from users */}
      <input
        type="text"
        name="honeypot"
        value={formData.honeypot}
        onChange={handleInputChange}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
      />

      <div className="bg-white-5 border border-white-20 rounded-card p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="name" className={labelClasses}>
              <FiUser size={14} />
              Full Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={inputClasses}
              placeholder="Enter your full name"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className={labelClasses}>
              <FiMail size={14} />
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className={inputClasses}
              placeholder="Enter your email address"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="subject" className={labelClasses}>
            <FiMessageCircle size={14} />
            Subject *
          </label>
          <select
            id="subject"
            name="subject"
            value={formData.subject}
            onChange={handleInputChange}
            className={inputClasses + " cursor-pointer"}
            required
          >
            <option value="" className="bg-surface text-white-50">Select a subject</option>
            <option value="General Inquiry" className="bg-surface text-white-100">General Inquiry</option>
            <option value="Event Support" className="bg-surface text-white-100">Event Support</option>
            <option value="Technical Issue" className="bg-surface text-white-100">Technical Issue</option>
            <option value="Billing Question" className="bg-surface text-white-100">Billing Question</option>
            <option value="Request refund" className="bg-surface text-white-100">Request refund</option>
            <option value="Careers" className="bg-surface text-white-100">Careers</option>
            <option value="Organizer Support" className="bg-surface text-white-100">Organizer Support</option>
            <option value="Partnership Inquiry" className="bg-surface text-white-100">Partnership Inquiry</option>
            <option value="Other" className="bg-surface text-white-100">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="message" className={labelClasses}>
            Message *
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            className={inputClasses + " resize-none"}
            placeholder="Tell us how we can help you..."
            rows={6}
            maxLength={2000}
            required
          />
          <p className="text-xs font-poppins text-white-50 mt-1">
            {formData.message.length}/2000 characters
          </p>
        </div>

        {submitMessage && (
          <div
            className={`rounded-card px-4 py-3 text-sm font-poppins ${
              submitMessage.type === "success"
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            }`}
          >
            {submitMessage.text}
          </div>
        )}

        <div className="pt-4 border-t border-white-20">
          <button
            type="submit"
            disabled={contactMutation.isPending}
            className="w-full bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
          >
            {contactMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-dark/30 border-t-dark rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <FiSend size={14} />
                Send Message
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
