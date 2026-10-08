import React from "react";

/**
 * Converts URLs and Instagram @ mentions in text to clickable links
 * @param text - The text that may contain URLs and Instagram @ mentions
 * @param disableLinks - If true, renders spans with onClick instead of anchor tags (useful when inside another link)
 * @returns React element with clickable links
 */
export function linkifyText(
  text: string | null | undefined,
  disableLinks: boolean = false
): React.ReactNode {
  if (!text) return null;

  // Instagram @ mention regex - matches @username where username can contain letters, numbers, dots, underscores
  // Matches @ followed by username until whitespace, end of string, or punctuation (greedy match to include dots)
  const instagramMentionRegex =
    /@([a-zA-Z0-9][a-zA-Z0-9._]*)(?=\s|$|[!?;:)\]}>"'`,])/g;

  // URL regex pattern - matches http(s)://, www., and common TLDs
  // Note: We match URLs but will trim trailing punctuation afterward
  const urlRegex =
    /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g;

  // Characters that should be trimmed from the end of URLs
  const trailingPunctuation = /[.,!?;:)\]}>"'`]+$/;

  // Handler factories defined outside the loop to avoid recreating them
  const createHandleActivate = (linkUrl: string) => {
    return (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(linkUrl, "_blank", "noopener,noreferrer");
    };
  };

  const createHandleKeyDown = (linkUrl: string) => {
    return (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const handleActivate = createHandleActivate(linkUrl);
        handleActivate(e);
      }
    };
  };

  // First, collect all matches (Instagram mentions and URLs) with their positions
  interface Match {
    index: number;
    length: number;
    type: "instagram" | "url";
    username?: string;
    url?: string;
    displayText?: string;
  }

  const matches: Match[] = [];
  let match;

  // Find all URLs first (we need these to exclude Instagram mentions that are part of URLs)
  const foundUrlMatches: Match[] = [];
  while ((match = urlRegex.exec(text)) !== null) {
    let url = match[0];
    // Remove trailing punctuation that shouldn't be part of the URL
    url = url.replace(trailingPunctuation, "");
    const trimmedLength = url.length;

    // Add protocol if missing
    let fullUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      fullUrl = `https://${url}`;
    }

    let displayUrl = url;
    // Truncate display URL if too long
    if (displayUrl.length > 50) {
      displayUrl = displayUrl.substring(0, 47) + "...";
    }

    foundUrlMatches.push({
      index: match.index,
      length: trimmedLength,
      type: "url",
      url: fullUrl,
      displayText: displayUrl,
    });
  }

  // Find all Instagram @ mentions, but exclude any that are part of URLs
  while ((match = instagramMentionRegex.exec(text)) !== null) {
    const mentionIndex = match.index;
    const mentionLength = match[0].length;
    const mentionEnd = mentionIndex + mentionLength;

    // Check if this Instagram mention overlaps with any URL match
    // Use proper interval overlap test: two intervals overlap if start1 < end2 && end1 > start2
    let isPartOfUrl = false;
    for (const urlMatch of foundUrlMatches) {
      const urlEnd = urlMatch.index + urlMatch.length;
      // Check if mention overlaps with URL (including cases where mention ends immediately before URL starts)
      if (mentionIndex < urlEnd && mentionEnd > urlMatch.index) {
        isPartOfUrl = true;
        break;
      }
    }

    // Only add Instagram mentions that are not part of URLs
    if (!isPartOfUrl) {
      let username = match[1];
      // Remove trailing punctuation that shouldn't be part of the username
      // This includes periods and commas, which are valid in the middle of usernames but not at the end
      // The regex only matches at the end ($), so dots in the middle (e.g., "user.name") are preserved
      username = username.replace(/[.,!?;:)\]}>"'`]+$/, "");
      const trimmedMatch = `@${username}`;
      const trimmedLength = trimmedMatch.length;

      matches.push({
        index: match.index,
        length: trimmedLength,
        type: "instagram",
        username,
        url: `https://www.instagram.com/${username}/`,
        displayText: trimmedMatch,
      });
    }
  }

  // Add all URL matches
  matches.push(...foundUrlMatches);

  // Sort matches by index to process them in order
  matches.sort((a, b) => a.index - b.index);

  // Build the parts array
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyCounter = 0;

  for (const matchItem of matches) {
    // Add text before the match
    if (matchItem.index > lastIndex) {
      parts.push(text.substring(lastIndex, matchItem.index));
    }

    // Add the link or span based on disableLinks prop
    if (disableLinks) {
      parts.push(
        <span
          key={`link-${keyCounter++}`}
          role="link"
          tabIndex={0}
          onClick={createHandleActivate(matchItem.url!)}
          onKeyDown={createHandleKeyDown(matchItem.url!)}
          aria-label={`Open ${
            matchItem.type === "instagram" ? "Instagram profile" : "link"
          } ${matchItem.displayText}`}
          className="text-link"
          style={{ cursor: "pointer", textDecoration: "underline" }}
        >
          {matchItem.displayText}
        </span>
      );
    } else {
      parts.push(
        <a
          key={`link-${keyCounter++}`}
          href={matchItem.url!}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
        >
          {matchItem.displayText}
        </a>
      );
    }

    lastIndex = matchItem.index + matchItem.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  // If no matches were found, return the original text
  return parts.length > 0 ? parts : text;
}

/**
 * React component that renders text with clickable links
 */
export function LinkifiedText({
  text,
  className,
  disableLinks = false,
}: {
  text: string | null | undefined;
  className?: string;
  disableLinks?: boolean;
}) {
  const content = linkifyText(text, disableLinks);
  return <span className={className}>{content}</span>;
}
