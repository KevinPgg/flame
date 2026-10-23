/**
 * Registration form of one tier (prototype "cf-q"), same rules as the web QuestionsBuilder:
 * questions in order, hint, answer type, required; reorder; reuse earlier questions. A saved
 * event question (has `fieldId`) is shared and has answers on file: its wording/type can't change
 * here, and removing it only takes it off this tier (the event keeps it and its answers).
 */
import { Pressable, Text, View } from "react-native";
import { QUESTION_TYPES, copyQuestion, flameV2Colors as c, moveItem, newQuestionDraft, type EventFormErrors, type QuestionDraft } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../ui";
import { FieldError, Input, Toggle } from "./ui";

export function QuestionsBuilder({
  tierKey,
  questions,
  reusable,
  onChange,
  errors,
  errorText,
  reusableLabel,
}: {
  tierKey: string;
  questions: QuestionDraft[];
  reusable: QuestionDraft[];
  onChange: (next: QuestionDraft[]) => void;
  errors: EventFormErrors;
  errorText: (path: string) => string | null;
  reusableLabel?: string;
}) {
  const { t } = useI18n();
  const set = (i: number, patch: Partial<QuestionDraft>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const base = (q: QuestionDraft) => `tiers.${tierKey}.questions.${q.key}`;

  return (
    <View className="mt-4 rounded-v2-md bg-v2-ink3 p-3">
      <View className="mb-2 px-1">
        <Text className="font-v2-ui-semibold text-[13.5px] text-v2-cream">{t("eventForm.questions")}</Text>
        <Text className="font-v2-ui text-[12px] text-v2-c50">
          {questions.length ? t("eventForm.questionsCount", { count: questions.length }) : t("eventForm.questionsEmpty")}
        </Text>
      </View>

      <View className="gap-2">
        {questions.map((q, i) => {
          const p = base(q);
          const locked = Boolean(q.fieldId);
          return (
            <View key={q.key} className="rounded-v2-md bg-v2-ink2 p-2.5">
              <View className="flex-row items-center gap-1.5">
                <View className="h-6 w-6 items-center justify-center rounded-full bg-v2-ink4">
                  <Text className="font-v2-ui text-[12px] text-v2-c70">{i + 1}</Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Input
                    value={q.label}
                    onChangeText={(label) => set(i, { label })}
                    placeholder={t("eventForm.questionPlaceholder")}
                    accessibilityLabel={`${t("eventForm.question")} ${i + 1}`}
                    editable={!locked}
                    invalid={Boolean(errors[`${p}.label`])}
                    className="h-10"
                  />
                </View>
                <IconBtn icon="up" label={t("eventForm.moveUp")} disabled={i === 0} onPress={() => onChange(moveItem(questions, i, -1))} />
                <IconBtn icon="down" label={t("eventForm.moveDown")} disabled={i === questions.length - 1} onPress={() => onChange(moveItem(questions, i, 1))} />
                <IconBtn icon="close" label={`${t("eventForm.removeQuestion")} ${i + 1}`} onPress={() => onChange(questions.filter((_, j) => j !== i))} />
              </View>
              <FieldError message={errorText(`${p}.label`)} />
              <Input
                value={q.placeholder}
                onChangeText={(placeholder) => set(i, { placeholder })}
                placeholder={t("eventForm.hintPlaceholder")}
                accessibilityLabel={`${t("eventForm.hintPlaceholder")} ${i + 1}`}
                editable={!locked}
                invalid={Boolean(errors[`${p}.placeholder`])}
                className="mt-2 h-10"
              />
              <FieldError message={errorText(`${p}.placeholder`)} />
              {locked && <Text className="mt-1.5 px-1 font-v2-ui text-[11.5px] text-v2-c50">{t("eventForm.questionShared")}</Text>}
              <View className="mt-2 flex-row flex-wrap gap-1" accessibilityRole="radiogroup" accessibilityLabel={t("eventForm.questionType")}>
                {QUESTION_TYPES.map((type) => {
                  const on = q.type === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => set(i, { type })}
                      disabled={locked && !on}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: locked && !on }}
                      accessibilityLabel={t(`eventForm.qtypes.${type}`)}
                      className={`h-8 justify-center rounded-v2-pill px-3 ${on ? "bg-v2-cream" : "bg-v2-ink3"} ${locked && !on ? "opacity-40" : ""}`}
                    >
                      <Text className={`text-[12.5px] ${on ? "font-v2-ui-semibold text-v2-ink" : "font-v2-ui text-v2-c70"}`}>{t(`eventForm.qtypes.${type}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                onPress={() => !locked && set(i, { required: !q.required })}
                accessibilityRole="switch"
                accessibilityLabel={`${t("eventForm.required")} ${i + 1}`}
                accessibilityState={{ checked: q.required, disabled: locked }}
                className={`mt-2 flex-row items-center gap-2 self-start ${locked ? "opacity-60" : ""}`}
              >
                <Toggle on={q.required} small />
                <Text className="font-v2-ui text-[12.5px] text-v2-c70">{t("eventForm.required")}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {reusable.length > 0 && (
        <View className="mt-3 px-1">
          <Text className="font-v2-ui text-[12px] text-v2-c50">{reusableLabel ?? t("eventForm.reuse")}</Text>
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            {reusable.map((q) => (
              <Pressable
                key={q.key}
                onPress={() => onChange([...questions, copyQuestion(q)])}
                accessibilityRole="button"
                accessibilityLabel={`+ ${q.label.trim()}`}
                className="h-8 max-w-full flex-row items-center gap-1 rounded-v2-pill bg-v2-ink4 px-3 active:bg-v2-c16"
              >
                <Icon name="plus" size={14} color={c.cream} />
                <Text numberOfLines={1} className="shrink font-v2-ui text-[12.5px] text-v2-cream">{q.label.trim()}</Text>
              </Pressable>
            ))}
            {reusable.length > 1 && (
              <Pressable onPress={() => onChange([...questions, ...reusable.map(copyQuestion)])} accessibilityRole="button" className="h-8 justify-center rounded-v2-pill bg-v2-ink4 px-3 active:bg-v2-c16">
                <Text className="font-v2-ui-semibold text-[12.5px] text-v2-cream">{t("eventForm.reuseAll")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <Pressable onPress={() => onChange([...questions, newQuestionDraft()])} accessibilityRole="button" className="mt-3 h-9 flex-row items-center gap-1.5 self-start rounded-v2-pill px-2 active:bg-v2-ink4">
        <Icon name="plus" size={15} color={c.cream} />
        <Text className="font-v2-ui-semibold text-[13px] text-v2-cream">{t("eventForm.addQuestion")}</Text>
      </Pressable>
    </View>
  );
}

export function IconBtn({ icon, label, onPress, disabled }: { icon: "up" | "down" | "close"; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      className={`h-8 w-8 items-center justify-center rounded-full active:bg-v2-ink4 ${disabled ? "opacity-30" : ""}`}
    >
      <Icon name={icon} size={16} />
    </Pressable>
  );
}
