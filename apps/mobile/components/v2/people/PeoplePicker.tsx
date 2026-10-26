/**
 * Pick a Flame account for an organizer tool (team now; send tickets and scanners next).
 * Restricted search (Kevin, 2026-10-23): suggestions as you type only among people already
 * connected to the organization; anyone else only by their full e-mail.
 * GET /api/organizer/people?organizationId=&q= (debounced, stale answers dropped).
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiGet } from "../../../lib/api";
import { apiErrorText } from "../../../lib/v2/organizer-api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { Icon } from "../ui";
import { FieldError, Input } from "../form/ui";

export type Person = { id: string; email: string; first_name: string | null; last_name: string | null; related?: boolean };

export const personName = (p: Pick<Person, "first_name" | "last_name" | "email">) =>
  [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email;

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function PeoplePicker({
  organization,
  value,
  onChange,
  disabled,
}: {
  organization: { id: string; name: string };
  value: Person | null;
  onChange: (p: Person | null) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { getToken } = useOptionalAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);
  // getToken / t can change identity on every render (Clerk): read them through refs so the
  // search runs once per change of the text, not in a loop (Kevin, 10-26: server log flooded).
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const term = q.trim();
    const id = ++req.current;
    setError(null);
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const json = await apiGet<{ people: Person[] }>(
          `/api/organizer/people?organizationId=${encodeURIComponent(organization.id)}&q=${encodeURIComponent(term)}`,
          () => tokenRef.current(),
        );
        if (id === req.current) setResults(json.people ?? []);
      } catch (e) {
        if (id === req.current) setError(apiErrorText(e, tRef.current("errors.generic")));
      } finally {
        if (id === req.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, organization.id]);

  if (value) {
    return (
      <View className="flex-row items-center gap-3 rounded-v2-md bg-v2-ink3 p-3">
        <Avatar name={personName(value)} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{personName(value)}</Text>
          <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{value.email}</Text>
        </View>
        <Pressable onPress={() => onChange(null)} disabled={disabled} accessibilityRole="button" className="h-9 justify-center rounded-v2-pill px-3 active:bg-v2-ink4">
          <Text className="font-v2-ui-semibold text-[13px] text-v2-c90">{t("people.change")}</Text>
        </Pressable>
      </View>
    );
  }

  const term = q.trim();
  const empty = !searching && results !== null && results.length === 0;
  return (
    <View>
      <Input
        value={q}
        onChangeText={setQ}
        placeholder={t("people.placeholder")}
        accessibilityLabel={t("people.label")}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!disabled}
      />
      <Text className="mt-1.5 font-v2-ui text-[12px] leading-[16px] text-v2-c50">{t("people.hint", { org: organization.name })}</Text>
      {searching && <Text className="mt-2 font-v2-ui text-[13px] text-v2-c50">{t("people.searching")}</Text>}
      {empty && (
        <Text className="mt-2 font-v2-ui text-[13px] text-v2-c70">
          {looksLikeEmail(term) ? t("people.noAccount") : t("people.none", { org: organization.name })}
        </Text>
      )}
      {results && results.length > 0 && (
        <View className="mt-2 overflow-hidden rounded-v2-md bg-v2-ink3">
          {results.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => {
                onChange(p);
                setQ("");
                setResults(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${personName(p)} ${p.email}`}
              className={`flex-row items-center gap-3 px-3 py-2.5 active:bg-v2-ink4 ${i > 0 ? "border-t border-v2-c06" : ""}`}
            >
              <Avatar name={personName(p)} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{personName(p)}</Text>
                <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{p.email}</Text>
              </View>
              {p.related === false ? <Text className="font-v2-ui text-[11.5px] text-v2-c50">{t("people.byEmail")}</Text> : <Icon name="chev" size={16} color={c.c50} />}
            </Pressable>
          ))}
        </View>
      )}
      <FieldError message={error} />
    </View>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }} className="items-center justify-center bg-v2-ink4">
      <Text className="font-v2-ui-bold text-[12px] text-v2-cream">{initials}</Text>
    </View>
  );
}
