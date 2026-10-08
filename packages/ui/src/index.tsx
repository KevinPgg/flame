/**
 * @project-flame/ui
 *
 * Shared UI components for the Flame design system.
 * Built with React Native + NativeWind. Used by both web and mobile apps.
 */

export { colors } from "./theme/colors";

// Components
export { FlameText } from "./components/FlameText";
export { PillButton } from "./components/PillButton";
export { EventCard } from "./components/EventCard";
export { CategoryPill } from "./components/CategoryPill";
export { CategoryFilterPills } from "./components/CategoryFilterPills";
export { SectionHeader } from "./components/SectionHeader";
export { FAQItem } from "./components/FAQItem";
export { SpotlightCard } from "./components/SpotlightCard";
export { EventListCard } from "./components/EventListCard";
export { GlowBlob } from "./components/GlowBlob";
export { FlameImage } from "./components/FlameImage";
export { CustomRefreshControl } from "./components/CustomRefreshControl";
export { SelectionListModal } from "./components/SelectionListModal";
export { Skeleton } from "./components/Skeleton";

// Types
export type { FlameImageProps } from "./components/FlameImage";
export type { EventCardData } from "./components/EventCard";
export type { PillButtonProps } from "./components/PillButton";
export type { Variant } from "./components/FlameText";
export type { CategoryData } from "./components/CategoryPill";
export type { FAQData } from "./components/FAQItem";
export type { SpotlightData, DJData } from "./components/SpotlightCard";
export type { FilterCategory } from "./types/events";
export type {
  CategoryFilterPillsProps,
  FilterPillProps,
} from "./components/CategoryFilterPills";
export type { SelectionItem, SelectionListModalProps } from "./components/SelectionListModal";
