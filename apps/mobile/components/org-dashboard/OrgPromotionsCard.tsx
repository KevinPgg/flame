/**
 * Promotions card — displays promo codes and allows creating new ones.
 *
 * Ported from: apps/web/app/api/organizer/promotional-codes/route.ts
 * and apps/web/app/components/PromotionsSection.tsx (discount % dropdown)
 */

import { useState, useCallback } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, ActionSheetIOS, Platform, ScrollView, Modal } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@project-flame/ui";
import { OrgSectionCard } from "./OrgSectionCard";
import { useCreatePromoCode, useDeletePromoCode } from "../../hooks/usePromoCodes";

interface PromoCodeDisplay {
  id: string;
  code: string;
  discountPercent: number;
  usedCount: number;
  maxUses: number;
}

interface OrgPromotionsCardProps {
  eventId: string;
  promoCodes: PromoCodeDisplay[];
  onClose: () => void;
}

function PromoCodePill({
  promo,
  onDelete,
  isDeleting,
}: {
  promo: PromoCodeDisplay;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const handleDelete = () => {
    Alert.alert(
      "Delete Promo Code",
      `Are you sure you want to delete "${promo.code}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: onDelete },
      ],
    );
  };

  return (
    <View className="border border-white-20 rounded-pill p-2 flex-row items-center gap-2">
      <View className="flex-row items-center gap-2 flex-1">
        <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
          {promo.code}
        </Text>
        <Text className="text-white-100 text-xs leading-4 font-poppins">
          {promo.discountPercent}% · {promo.usedCount}/{promo.maxUses} used
        </Text>
      </View>
      <Pressable
        hitSlop={6}
        onPress={handleDelete}
        disabled={isDeleting}
        style={isDeleting ? { opacity: 0.4 } : undefined}
      >
        <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.5)" />
      </Pressable>
    </View>
  );
}

const DISCOUNT_OPTIONS = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);

export function OrgPromotionsCard({
  eventId,
  promoCodes,
  onClose,
}: OrgPromotionsCardProps) {
  const createPromoCode = useCreatePromoCode();
  const deletePromoCode = useDeletePromoCode();
  const [deletingPromoId, setDeletingPromoId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState<number>(10);
  const [usageLimit, setUsageLimit] = useState("");
  const [showDiscountPicker, setShowDiscountPicker] = useState(false);

  const showDiscountSelector = () => {
    if (Platform.OS === "ios") {
      const options = DISCOUNT_OPTIONS.map((v) => `${v}%`);
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, "Cancel"], cancelButtonIndex: options.length, title: "Select Discount %" },
        (idx) => { if (idx < options.length) setDiscountPercentage(DISCOUNT_OPTIONS[idx]); }
      );
    } else {
      setShowDiscountPicker(true);
    }
  };

  const handleCreate = useCallback(async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode || trimmedCode.length < 3 || trimmedCode.length > 20) {
      Alert.alert("Validation", "Code must be 3-20 alphanumeric characters.");
      return;
    }
    if (!/^[A-Z0-9]+$/.test(trimmedCode)) {
      Alert.alert("Validation", "Code must be alphanumeric only.");
      return;
    }
    if (discountPercentage < 5 || discountPercentage > 100 || discountPercentage % 5 !== 0) {
      Alert.alert("Validation", "Discount must be 5-100 in increments of 5.");
      return;
    }
    const limit = parseInt(usageLimit, 10);
    if (isNaN(limit) || limit < 1) {
      Alert.alert("Validation", "Usage limit must be at least 1.");
      return;
    }

    try {
      await createPromoCode.mutateAsync({
        event_id: eventId,
        code: trimmedCode,
        discount_percentage: discountPercentage,
        usage_limit: limit,
      });
      Alert.alert("Success", `Promo code "${trimmedCode}" created.`);
      setCode("");
      setDiscountPercentage(10);
      setUsageLimit("");
      setShowForm(false);
      setShowDiscountPicker(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create promo code";
      Alert.alert("Error", message);
    }
  }, [eventId, code, discountPercentage, usageLimit, createPromoCode]);

  return (
    <OrgSectionCard
      icon={<MaterialCommunityIcons name="percent" size={22} color="#F9FBFE" />}
      title="Promotions"
      onClose={onClose}
    >
      {promoCodes.length > 0 ? (
        <View className="gap-2">
          {promoCodes.map((promo) => (
            <PromoCodePill
              key={promo.id}
              promo={promo}
              isDeleting={deletingPromoId === promo.id && deletePromoCode.isPending}
              onDelete={() => {
                setDeletingPromoId(promo.id);
                deletePromoCode.mutate(
                  { id: promo.id, eventId },
                  {
                    onError: (err) => {
                      const msg = err instanceof Error ? err.message : "Failed to delete promo code";
                      Alert.alert("Error", msg);
                    },
                    onSettled: () => setDeletingPromoId(null),
                  },
                );
              }}
            />
          ))}
        </View>
      ) : (
        <Text className="text-white-50 text-sm leading-5 font-poppins">
          No promo codes yet.
        </Text>
      )}

      {showForm ? (
        <View className="gap-3 bg-white-5 rounded-card p-3">
          <TextInput
            placeholder="Code (e.g. SAVE20)"
            placeholderTextColor="rgba(255,255,255,0.5)"
            className="bg-white-5 border border-white-10 rounded-pill p-3 text-white-100 text-sm font-poppins"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
          />
          <Pressable
            onPress={showDiscountSelector}
            className="bg-white-5 border border-white-10 rounded-pill p-3 flex-row items-center justify-between"
          >
            <Text className="text-white-100 text-sm font-poppins">
              Discount: {discountPercentage}%
            </Text>
            <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.5)" />
          </Pressable>
          <TextInput
            placeholder="Usage limit"
            placeholderTextColor="rgba(255,255,255,0.5)"
            className="bg-white-5 border border-white-10 rounded-pill p-3 text-white-100 text-sm font-poppins"
            value={usageLimit}
            onChangeText={setUsageLimit}
            keyboardType="numeric"
          />
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                setShowForm(false);
                setShowDiscountPicker(false);
              }}
              className="flex-1 border border-white-30 rounded-pill py-2 items-center"
            >
              <Text className="text-white-100 text-sm font-poppins-medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              disabled={createPromoCode.isPending}
              className={`flex-1 bg-white-100 rounded-pill py-2 items-center flex-row justify-center gap-1 ${
                createPromoCode.isPending ? "opacity-60" : ""
              }`}
            >
              {createPromoCode.isPending && <ActivityIndicator size="small" color={colors.dark} />}
              <Text style={{ color: colors.dark }} className="text-sm font-poppins-medium">
                {createPromoCode.isPending ? "Creating..." : "Create"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setShowForm(true)}>
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            Add Code
          </Text>
        </Pressable>
      )}

      {Platform.OS !== "ios" && showDiscountPicker && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowDiscountPicker(false)}>
          <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setShowDiscountPicker(false)}>
            <Pressable className="bg-surface rounded-t-3xl p-4" onPress={(e) => e.stopPropagation()}>
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-white-80 text-base font-poppins-medium">Select Discount %</Text>
                <Pressable onPress={() => setShowDiscountPicker(false)}>
                  <Text className="text-white-100 text-base font-poppins-semibold">Done</Text>
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 300 }}>
                {DISCOUNT_OPTIONS.map((val) => (
                  <Pressable
                    key={val}
                    onPress={() => {
                      setDiscountPercentage(val);
                      setShowDiscountPicker(false);
                    }}
                    className={`py-3 px-4 flex-row items-center justify-between ${
                      discountPercentage === val ? "bg-white-10 rounded-card" : ""
                    }`}
                  >
                    <Text className="text-white-100 text-sm font-poppins">{val}%</Text>
                    {discountPercentage === val && (
                      <Ionicons name="checkmark" size={20} color="#F9FBFE" />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </OrgSectionCard>
  );
}
