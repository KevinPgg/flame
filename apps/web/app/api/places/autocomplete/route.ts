import { NextRequest, NextResponse } from "next/server";

const requestsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) ?? []).filter(
    t => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    requestsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestsByIp.set(ip, recent);
  return false;
}

interface GooglePrediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Places API not configured" },
      { status: 500 }
    );
  }

  const input = req.nextUrl.searchParams.get("input")?.trim() ?? "";
  if (input.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  // x-forwarded-for is set by Vercel's edge from the TCP source IP; safe to trust the
  // leftmost value on Vercel. Rate limiting here is best-effort defense-in-depth — the
  // real cost ceiling is the GCP-side Places daily quota + monthly budget alert.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/autocomplete/json"
  );
  url.searchParams.set("input", input);
  url.searchParams.set("types", "(cities)");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream error" },
        { status: 502 }
      );
    }
    const json = (await res.json()) as {
      status?: string;
      error_message?: string;
      predictions?: GooglePrediction[];
    };

    if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      console.error(
        "[places/autocomplete] Google returned non-OK status:",
        json.status,
        json.error_message
      );
      return NextResponse.json(
        { error: "Upstream error" },
        { status: 502 }
      );
    }

    const predictions = (json.predictions ?? []).map(p => ({
      place_id: p.place_id,
      description: p.description,
      structured_formatting: {
        main_text: p.structured_formatting?.main_text ?? p.description,
        secondary_text: p.structured_formatting?.secondary_text ?? "",
      },
    }));

    return NextResponse.json({ predictions });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      console.error("[places/autocomplete] upstream timeout after 5s");
      return NextResponse.json(
        { error: "Upstream timeout" },
        { status: 504 }
      );
    }
    console.error("[places/autocomplete] fetch failed:", error);
    return NextResponse.json(
      { error: "Upstream error" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
