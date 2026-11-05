/**
 * Country selector for Stripe Connect onboarding.
 *
 * The organizer's country must be chosen BEFORE the connected account is created
 * because the service agreement (recipient vs full) is locked at creation time.
 * Renders a tappable field + bottom-sheet picker. Mirrors the native Modal
 * bottom-sheet pattern used elsewhere (EditRoleSheet). See JUNE_2026_FIXES.md.
 * The last option, CONNECT_COUNTRY_NOT_LISTED, defers the choice to
 * Stripe-hosted onboarding for countries outside our curated list.
 */

import { useState } from "react";
import { Modal, View, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import {
  STRIPE_CONNECT_COUNTRIES,
  CONNECT_COUNTRY_NOT_LISTED,
  CONNECT_COUNTRY_NOT_LISTED_LABEL,
} from "@project-flame/lib";

const COUNTRY_OPTIONS = [
  ...STRIPE_CONNECT_COUNTRIES.map(({ code, name }) => ({ code, name })),
  { code: CONNECT_COUNTRY_NOT_LISTED, name: CONNECT_COUNTRY_NOT_LISTED_LABEL },
];

interface ConnectCountrySelectorProps {
  value: string;
  onChange: (countryCode: string) => void;
  disabled?: boolean;
}

export function ConnectCountrySelector({
  value,
  onChange,
  disabled,
}: ConnectCountrySelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = COUNTRY_OPTIONS.find((c) => c.code === value);

  return (
    <View className="gap-2">
      <FlameText
        variant="subtitle2"
        className="text-white-80 font-poppins-medium"
      >
        Country of operation
      </FlameText>

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Select country of operation"
        className={`flex-row items-center justify-between bg-white-5 border border-white-10 rounded-pill px-4 py-3 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <FlameText variant="subtitle1" className="text-white-100 font-poppins">
          {selected?.name ?? "Select a country"}
        </FlameText>
        <Ionicons
          name="chevron-down"
          size={18}
          color={colors["white-50"]}
        />
      </Pressable>

      <FlameText variant="subtitle2-light" className="text-white-50">
        {value === CONNECT_COUNTRY_NOT_LISTED
          ? "You'll choose your country on Stripe's secure setup page. It can't be changed after setup begins."
          : "Select where your organization legally operates. This can't be changed after setup begins."}
      </FlameText>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="flex-1 bg-black/55"
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss country picker"
          />

          <View className="bg-surface rounded-t-[28px] pb-10">
            {/* Drag handle */}
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 rounded-sm bg-white-20" />
            </View>

            <View className="px-6 pt-2 gap-4">
              <FlameText
                variant="h3"
                className="text-white-100 font-poppins-semibold"
              >
                Select Country
              </FlameText>

              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                className="max-h-[360px]"
              >
                <View className="gap-2">
                  {COUNTRY_OPTIONS.map((c) => {
                    const isSelected = c.code === value;
                    return (
                      <Pressable
                        key={c.code}
                        onPress={() => {
                          onChange(c.code);
                          setOpen(false);
                        }}
                        className={`flex-row items-center justify-between py-[14px] px-4 rounded-badge border-[1.5px] ${
                          isSelected
                            ? "border-white-60 bg-white-10"
                            : "border-white-10 bg-white-5"
                        }`}
                      >
                        <FlameText
                          variant="subtitle1"
                          className="text-white-100 font-poppins-medium"
                        >
                          {c.name}
                        </FlameText>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={colors["white-100"]}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
