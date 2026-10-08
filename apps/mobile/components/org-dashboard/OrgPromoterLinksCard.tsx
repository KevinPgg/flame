/**
 * Promoter links card — displays links with stats and allows generating/deleting.
 *
 * Ported from: apps/web/app/components/PromotionsSection.tsx (promoter links section)
 * Uses web API via lib/api.ts.
 */

import { useState, useCallback } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { formatCentsAsPrice } from "@project-flame/lib";
import { OrgSectionCard } from "./OrgSectionCard";
import { useCreatePromoterLink, useDeletePromoterLink } from "../../hooks/usePromoterLinks";

interface PromoterLinkDisplay {
  id: string;
  code: string;
  fullUrl: string | null;
  ticketsSold: number;
  revenueCents: number;
}

interface OrgPromoterLinksCardProps {
  eventId: string;
  links: PromoterLinkDisplay[];
  currency?: string;
  onClose: () => void;
}

function LinkPill({
  link,
  onDelete,
  isDeleting,
  currency,
}: {
  link: PromoterLinkDisplay;
  onDelete: () => void;
  isDeleting: boolean;
  currency?: string;
}) {
  const handleCopy = async () => {
    if (!link.fullUrl) return;
    try {
      await Clipboard.setStringAsync(link.fullUrl);
      Alert.alert("Copied", "Promoter URL copied to clipboard.");
    } catch (e) {
      if (__DEV__) console.error("Clipboard copy failed:", e);
      Alert.alert("Copy failed", "Could not copy to clipboard. Please try again.");
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Promoter Link",
      `Are you sure you want to delete "${link.code}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: onDelete },
      ],
    );
  };

  return (
    <View className="border border-white-20 rounded-card p-3 gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="text-white-100 text-xs leading-4 font-poppins-medium flex-1" numberOfLines={1}>
          {link.code}
        </Text>
        <Pressable
          hitSlop={4}
          onPress={handleCopy}
          disabled={!link.fullUrl}
          style={!link.fullUrl ? { opacity: 0.3 } : undefined}
        >
          <Ionicons name="copy-outline" size={18} color="#F9FBFE" />
        </Pressable>
        <Pressable
          hitSlop={4}
          onPress={handleDelete}
          disabled={isDeleting}
          style={isDeleting ? { opacity: 0.4 } : undefined}
        >
          <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>
      <View className="flex-row items-center gap-4">
        <Text className="text-white-50 text-xs leading-4 font-poppins">
          {link.ticketsSold} ticket{link.ticketsSold !== 1 ? "s" : ""} sold
        </Text>
        <Text className="text-white-50 text-xs leading-4 font-poppins">
          {formatCentsAsPrice(link.revenueCents, currency)} revenue
        </Text>
      </View>
    </View>
  );
}

export function OrgPromoterLinksCard({
  eventId,
  links,
  currency,
  onClose,
}: OrgPromoterLinksCardProps) {
  const createLink = useCreatePromoterLink();
  const deleteLink = useDeletePromoterLink();
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [promoterCode, setPromoterCode] = useState("");
  const [promoterName, setPromoterName] = useState("");

  const handleCreate = useCallback(async () => {
    const trimmedCode = promoterCode.trim().toUpperCase();
    if (!trimmedCode || trimmedCode.length < 3 || trimmedCode.length > 50) {
      Alert.alert("Validation", "Code must be 3-50 alphanumeric characters.");
      return;
    }
    if (!/^[A-Z0-9]+$/.test(trimmedCode)) {
      Alert.alert("Validation", "Code must be alphanumeric only.");
      return;
    }

    try {
      await createLink.mutateAsync({
        event_id: eventId,
        promoter_code: trimmedCode,
        promoter_name: promoterName.trim() || undefined,
      });
      Alert.alert("Success", `Promoter link "${trimmedCode}" created.`);
      setPromoterCode("");
      setPromoterName("");
      setShowForm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create link";
      Alert.alert("Error", message);
    }
  }, [eventId, promoterCode, promoterName, createLink]);

  return (
    <OrgSectionCard
      icon={<Ionicons name="link" size={22} color="#F9FBFE" />}
      title="Promoter Links"
      onClose={onClose}
    >
      {links.length > 0 ? (
        <View className="gap-2">
          {links.map((link) => (
            <LinkPill
              key={link.id}
              link={link}
              isDeleting={deletingLinkId === link.id && deleteLink.isPending}
              currency={currency}
              onDelete={() => {
                setDeletingLinkId(link.id);
                deleteLink.mutate(
                  { id: link.id, eventId },
                  {
                    onError: (err) => {
                      const msg = err instanceof Error ? err.message : "Failed to delete link";
                      Alert.alert("Error", msg);
                    },
                    onSettled: () => setDeletingLinkId(null),
                  },
                );
              }}
            />
          ))}
        </View>
      ) : (
        <Text className="text-white-50 text-sm leading-5 font-poppins">
          No promoter links yet.
        </Text>
      )}

      {showForm ? (
        <View className="gap-3 bg-white-5 rounded-card p-3">
          <TextInput
            placeholder="Promoter code (e.g. JOHN2026)"
            placeholderTextColor="rgba(255,255,255,0.5)"
            className="bg-white-5 border border-white-10 rounded-pill p-3 text-white-100 text-sm font-poppins"
            value={promoterCode}
            onChangeText={setPromoterCode}
            autoCapitalize="characters"
          />
          <TextInput
            placeholder="Promoter name (optional)"
            placeholderTextColor="rgba(255,255,255,0.5)"
            className="bg-white-5 border border-white-10 rounded-pill p-3 text-white-100 text-sm font-poppins"
            value={promoterName}
            onChangeText={setPromoterName}
          />
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setShowForm(false)}
              className="flex-1 border border-white-30 rounded-pill py-2 items-center"
            >
              <Text className="text-white-100 text-sm font-poppins-medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              disabled={createLink.isPending}
              className={`flex-1 bg-white-100 rounded-pill py-2 items-center flex-row justify-center gap-1 ${
                createLink.isPending ? "opacity-60" : ""
              }`}
            >
              {createLink.isPending && <ActivityIndicator size="small" color="#041C2B" />}
              <Text className="text-dark text-sm font-poppins-medium">
                {createLink.isPending ? "Creating..." : "Generate"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setShowForm(true)}>
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            Generate Link
          </Text>
        </Pressable>
      )}
    </OrgSectionCard>
  );
}
