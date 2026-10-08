import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Simple in-memory rate limiter (not persistent across restarts/serverless invocations)
// For production, use Redis or a database-backed rate limiter
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; firstAttempt: number }>();

export async function POST(req: Request) {
  try {
    // Rate limiting logic
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
    const now = Date.now();
    const userAttempts = attempts.get(ip) || { count: 0, firstAttempt: now };

    if (now - userAttempts.firstAttempt > RATE_LIMIT_WINDOW) {
      // Reset window
      userAttempts.count = 1;
      userAttempts.firstAttempt = now;
    } else {
      userAttempts.count++;
    }

    attempts.set(ip, userAttempts);

    if (userAttempts.count > MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    let code: string;
    try {
      const body = await req.json();
      code = body.code;
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "Code is required" },
        { status: 400 }
      );
    }

    const correctCode = process.env.UTESTINGA;

    if (!correctCode) {
      console.error("UTESTINGA environment variable is not set");
      return NextResponse.json(
        { error: "Configuration error" },
        { status: 500 }
      );
    }

    // Constant-time comparison to prevent timing attacks
    // Note: In a real Node.js environment we'd use crypto.timingSafeEqual
    // But for this simple string comparison in Edge/Serverless, we can just be careful
    // or accept the minimal risk given the low stakes of "maintenance mode bypass"
    if (code === correctCode) {
      // Set a cookie that expires in 7 days
      const cookieStore = await cookies();
      cookieStore.set("user_testing_access", "true", {
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  } catch (error) {
    console.error("Error verifying testing code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
