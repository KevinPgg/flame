"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Prediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface CityAutocompleteFieldProps {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export function CityAutocompleteField({
  value,
  onChange,
  placeholder = "City",
  id,
  className,
  required,
  disabled,
}: CityAutocompleteFieldProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const fetchPredictions = useCallback(async (text: string) => {
    abortRef.current?.abort();
    if (text.length < 2) {
      abortRef.current = null;
      setLoading(false);
      setPredictions([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/places/autocomplete?input=${encodeURIComponent(text)}`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        setPredictions([]);
        return;
      }
      const json = (await res.json()) as { predictions?: Prediction[] };
      setPredictions(json.predictions ?? []);
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      console.error("[CityAutocompleteField] failed to fetch predictions", error);
      setPredictions([]);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  const handleChange = (text: string) => {
    onChange(text);
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    setShowDropdown(true);
    debounceRef.current = setTimeout(() => fetchPredictions(text), 300);
  };

  const handleSelect = (prediction: Prediction) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    const cityName = prediction.structured_formatting.main_text;
    onChange(cityName);
    setPredictions([]);
    setShowDropdown(false);
  };

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setShowDropdown(false), 150);
  };

  const handleFocus = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    if (predictions.length > 0) setShowDropdown(true);
  };

  return (
    <div className="relative">
      <input
        type="text"
        id={id}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
        className={className}
      />
      {loading && (
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white-30 border-t-white-100" />
        </div>
      )}
      {showDropdown && predictions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-card border border-white-20 bg-surface shadow-lg">
          {predictions.map((prediction, index) => (
            <button
              key={prediction.place_id}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                handleSelect(prediction);
              }}
              className={`block w-full cursor-pointer border-0 bg-transparent px-4 py-2.5 text-left font-poppins text-sm text-white-100 transition-colors hover:bg-white-10 ${
                index > 0 ? "border-t border-t-white-10" : ""
              }`}
            >
              {prediction.structured_formatting.main_text}
              {prediction.structured_formatting.secondary_text && (
                <span className="text-white-50">
                  {", "}
                  {prediction.structured_formatting.secondary_text}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
