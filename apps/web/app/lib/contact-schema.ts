import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Please enter a valid email address").max(255),
  subject: z.string().trim().min(1, "Please enter a subject").max(200),
  message: z
    .string()
    .trim()
    .min(10, "Please provide a more detailed message (at least 10 characters)")
    .max(2000),
  honeypot: z.string().max(0, "Spam detected"),
});

export type ContactFormData = z.infer<typeof contactSchema>;
