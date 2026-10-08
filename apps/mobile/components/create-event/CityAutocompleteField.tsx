import { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? "";

interface Prediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface CityAutocompleteFieldProps {
  value: string;
  onCitySelect: (city: string) => void;
  placeholder?: string;
}

export function CityAutocompleteField({
  value,
  onCitySelect,
  placeholder = "City",
}: CityAutocompleteFieldProps) {
  const [inputText, setInputText] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressBlurRef = useRef(false);

  // Sync when parent value changes externally (e.g. form reset)
  useEffect(() => {
    setInputText(value);
  }, [value]);

  // Clear any pending debounce on unmount to prevent setState after unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 2) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json`
      );
      const json = await res.json();
      setPredictions(json.predictions ?? []);
    } catch (error) {
      console.error("[CityAutocompleteField] failed to fetch predictions", error);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChangeText = (text: string) => {
    setInputText(text);
    // Keep the parent form value in sync with what the user has typed so that
    // submitting without selecting a dropdown suggestion still persists the text.
    onCitySelect(text);
    setShowDropdown(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(text), 300);
  };

  const handleSelect = (prediction: Prediction) => {
    suppressBlurRef.current = true;
    const cityName = prediction.structured_formatting.main_text;
    setInputText(cityName);
    setPredictions([]);
    setShowDropdown(false);
    onCitySelect(cityName);
  };

  const handleBlur = () => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false;
      return;
    }
    setTimeout(() => setShowDropdown(false), 150);
  };

  // if (!GOOGLE_PLACES_API_KEY) {
  //   return (
  //     <View className="bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-4 p-4">
  //       <Ionicons name="location-outline" size={24} color="rgba(255,255,255,0.5)" />
  //       <Text className="flex-1 text-white-50 text-sm leading-5 font-poppins">
  //         Google Places API key not configured
  //       </Text>
  //     </View>
  //   );
  // }

  return (
    <View>
      <View className="bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-4 p-4">
        <Ionicons name="location-outline" size={24} color="rgba(255,255,255,0.5)" />
        <TextInput
          value={inputText}
          onChangeText={handleChangeText}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.5)"
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          className="flex-1 text-white-100 text-sm leading-5 font-poppins"
        />
        {loading && (
          <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
        )}
      </View>

      {showDropdown && predictions.length > 0 && (
        <View
          className="bg-surface border border-white-10 rounded-card mt-1 overflow-hidden"
        >
          {predictions.map((prediction, index) => (
            <View key={prediction.place_id}>
              {index > 0 && (
                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
              )}
              <Pressable
                onPressIn={() => { suppressBlurRef.current = true; }}
                onPress={() => handleSelect(prediction)}
                className="py-3 px-4"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "rgba(255,255,255,0.05)" : undefined,
                })}
              >
                <Text className="text-white-100 text-sm font-poppins">
                  {prediction.structured_formatting.main_text}
                  <Text className="text-white-50">
                    , {prediction.structured_formatting.secondary_text}
                  </Text>
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
