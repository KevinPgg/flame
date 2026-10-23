/**
 * City with suggestions (same source as the web form: GET /api/places/autocomplete, cities only).
 * Free text is kept as typed if the organizer doesn't pick a suggestion.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { apiGet } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { Input } from "./ui";

type Prediction = { place_id: string; description?: string; structured_formatting?: { main_text?: string; secondary_text?: string } };

export function CityField({ value, onChange, placeholder, invalid, accessibilityLabel, editable = true }: { value: string; onChange: (v: string) => void; placeholder: string; invalid?: boolean; accessibilityLabel: string; editable?: boolean }) {
  const { getToken } = useOptionalAuth();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [focused, setFocused] = useState(false);
  const req = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const type = (text: string) => {
    onChange(text);
    if (timer.current) clearTimeout(timer.current);
    const id = ++req.current;
    if (text.trim().length < 2) {
      setPredictions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const json = await apiGet<{ predictions?: Prediction[] }>(`/api/places/autocomplete?input=${encodeURIComponent(text.trim())}`, getToken);
        if (id === req.current) setPredictions((json.predictions ?? []).slice(0, 5));
      } catch {
        if (id === req.current) setPredictions([]);
      }
    }, 300);
  };

  return (
    <View>
      <Input
        bare
        value={value}
        onChangeText={type}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        invalid={invalid}
        editable={editable}
        accessibilityLabel={accessibilityLabel}
      />
      {focused && predictions.length > 0 && (
        <View className="mt-1 overflow-hidden rounded-v2-md bg-v2-ink3">
          {predictions.map((p) => {
            const main = p.structured_formatting?.main_text ?? p.description ?? "";
            return (
              <Pressable
                key={p.place_id}
                onPress={() => {
                  req.current += 1;
                  onChange(main);
                  setPredictions([]);
                }}
                accessibilityRole="button"
                accessibilityLabel={p.description ?? main}
                className="px-3 py-2.5 active:bg-v2-ink4"
              >
                <Text className="font-v2-ui text-[14px] text-v2-cream">{main}</Text>
                {p.structured_formatting?.secondary_text ? <Text className="font-v2-ui text-[12px] text-v2-c50">{p.structured_formatting.secondary_text}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
