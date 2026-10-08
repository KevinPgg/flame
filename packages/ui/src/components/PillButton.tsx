import { Pressable, Text, type PressableProps } from "react-native";

type PillVariant = "solid" | "ghost";

export interface PillButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: PillVariant;
  className?: string;
}

export function PillButton({
  label,
  variant = "solid",
  className = "",
  ...props
}: PillButtonProps) {
  const containerClasses =
    variant === "solid"
      ? "bg-white-100 rounded-pill px-[18px] py-2 items-center justify-center"
      : "bg-white-5 rounded-pill px-4 py-1 items-center justify-center";

  const textClasses =
    variant === "solid"
      ? "text-dark text-sm leading-[22px] font-poppins-medium"
      : "text-white-100 text-sm leading-[22px] font-poppins-medium";

  return (
    <Pressable className={`${containerClasses} ${className}`} {...props}>
      <Text className={textClasses}>{label}</Text>
    </Pressable>
  );
}
