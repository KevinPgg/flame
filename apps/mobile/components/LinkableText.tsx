/**
 * Text component that detects URLs and Instagram handles, rendering them as
 * tappable links that open via Linking.openURL().
 */

import { Text, Linking, Alert, type TextProps } from "react-native";

const URL_REGEX = /https?:\/\/[^\s)]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}\s]+$/;
const INSTAGRAM_REGEX = /@([a-zA-Z0-9_.]+)/g;

interface LinkableTextProps extends TextProps {
  children: string;
  linkColor?: string;
}

type Part = { type: "text"; value: string } | { type: "url"; value: string } | { type: "instagram"; value: string; handle: string };

function parseText(text: string): Part[] {
  const matches: { start: number; end: number; part: Part }[] = [];

  let m: RegExpExecArray | null;
  const urlRe = new RegExp(URL_REGEX.source, "g");
  while ((m = urlRe.exec(text)) !== null) {
    const raw = m[0];
    const trimmed = raw.replace(TRAILING_PUNCTUATION, "");
    matches.push({ start: m.index, end: m.index + trimmed.length, part: { type: "url", value: trimmed } });
  }

  const igRe = new RegExp(INSTAGRAM_REGEX.source, "g");
  while ((m = igRe.exec(text)) !== null) {
    const overlaps = matches.some((x) => m!.index >= x.start && m!.index < x.end);
    if (!overlaps) {
      matches.push({ start: m.index, end: m.index + m[0].length, part: { type: "instagram", value: m[0], handle: m[1] } });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const parts: Part[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, match.start) });
    }
    parts.push(match.part);
    cursor = match.end;
  }
  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }

  return parts;
}

function openLink(url: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert("Error", "Could not open the link.");
  });
}

export function LinkableText({ children, linkColor = "#60A5FA", style, ...rest }: LinkableTextProps) {
  if (!children) return null;

  const parts = parseText(children);

  if (parts.length === 1 && parts[0].type === "text") {
    return <Text style={style} {...rest}>{children}</Text>;
  }

  return (
    <Text style={style} {...rest}>
      {parts.map((part, i) => {
        if (part.type === "url") {
          return (
            <Text key={i} style={{ color: linkColor, textDecorationLine: "underline" }} onPress={() => openLink(part.value)}>
              {part.value}
            </Text>
          );
        }
        if (part.type === "instagram") {
          return (
            <Text
              key={i}
              style={{ color: linkColor, textDecorationLine: "underline" }}
              onPress={() => openLink(`https://instagram.com/${part.handle}`)}
            >
              {part.value}
            </Text>
          );
        }
        return <Text key={i}>{part.value}</Text>;
      })}
    </Text>
  );
}
