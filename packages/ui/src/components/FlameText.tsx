import { Text, type TextProps } from "react-native";

export type Variant =
  | "h3"
  | "h4"
  | "body"
  | "subtitle1"
  | "subtitle1-light"
  | "subtitle2"
  | "subtitle2-light";

const variantClasses: Record<Variant, string> = {
  h3: "text-2xl leading-8 font-poppins-medium",
  h4: "text-lg font-poppins-semibold",
  body: "text-base leading-[22px] font-poppins",
  subtitle1: "text-sm leading-5 font-poppins",
  "subtitle1-light": "text-sm leading-5 font-poppins-light",
  subtitle2: "text-xs leading-4 font-poppins-medium",
  "subtitle2-light": "text-xs leading-4 font-poppins-light",
};

interface FlameTextProps extends TextProps {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export function FlameText({
  variant = "body",
  className = "",
  children,
  ...props
}: FlameTextProps) {
  return (
    <Text
      className={`text-white-100 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </Text>
  );
}
