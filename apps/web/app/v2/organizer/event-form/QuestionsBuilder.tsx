"use client";

import {
  QUESTION_TYPES,
  copyQuestion,
  moveItem,
  newQuestionDraft,
  type EventFormErrors,
  type QuestionDraft,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { FieldError, fieldCls, fieldId, iconBtn } from "./ui";

/**
 * Registration form of one tier (prototype "cf-q"): questions in order, hint, answer type,
 * required; reorder with arrows; one-tap reuse of questions written in earlier tiers.
 */
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
  /** Caption over the reuse chips (create: earlier tiers; tier editor: the event's questions). */
  reusableLabel?: string;
}) {
  const { t } = useI18n();
  const set = (i: number, patch: Partial<QuestionDraft>) =>
    onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const base = (q: QuestionDraft) => `tiers.${tierKey}.questions.${q.key}`;

  return (
    <div className="mt-4 rounded-v2-md bg-v2-ink3 p-3">
      <div className="mb-2 px-1">
        <b className="block text-[13.5px] font-v2-ui-semibold">{t("eventForm.questions")}</b>
        <small className="text-[12px] text-v2-c50">
          {questions.length ? t("eventForm.questionsCount", { count: questions.length }) : t("eventForm.questionsEmpty")}
        </small>
      </div>

      <ol className="flex flex-col gap-2">
        {questions.map((q, i) => {
          const p = base(q);
          const labelErr = errorText(`${p}.label`);
          // Saved event question: shared with other tiers and answers on file → not editable here.
          const locked = Boolean(q.fieldId);
          return (
            <li key={q.key} className="rounded-v2-md bg-v2-ink2 p-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-v2-ink4 text-[12px] text-v2-c70">
                  {i + 1}
                </span>
                <input
                  id={fieldId(`${p}.label`)}
                  value={q.label}
                  onChange={(e) => set(i, { label: e.target.value })}
                  placeholder={t("eventForm.questionPlaceholder")}
                  aria-label={t("eventForm.question")}
                  readOnly={locked}
                  aria-invalid={labelErr ? true : undefined}
                  className={`${fieldCls} h-10 flex-1 bg-v2-ink3`}
                />
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => onChange(moveItem(questions, i, -1))} aria-label={t("eventForm.moveUp")}>
                  <Icon name="down" size={16} className="rotate-180" />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  disabled={i === questions.length - 1}
                  onClick={() => onChange(moveItem(questions, i, 1))}
                  aria-label={t("eventForm.moveDown")}
                >
                  <Icon name="down" size={16} />
                </button>
                <button type="button" className={iconBtn} onClick={() => onChange(questions.filter((_, j) => j !== i))} aria-label={t("eventForm.removeQuestion")}>
                  <Icon name="close" size={16} />
                </button>
              </div>
              <FieldError path={`${p}.label`} message={labelErr} />
              <input
                value={q.placeholder}
                onChange={(e) => set(i, { placeholder: e.target.value })}
                placeholder={t("eventForm.hintPlaceholder")}
                aria-label={t("eventForm.hintPlaceholder")}
                readOnly={locked}
                aria-invalid={errors[`${p}.placeholder`] ? true : undefined}
                className={`${fieldCls} mt-2 h-10 bg-v2-ink3`}
              />
              <FieldError message={errorText(`${p}.placeholder`)} />
              {locked && <p className="mt-1.5 px-1 text-[11.5px] text-v2-c50">{t("eventForm.questionShared")}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div role="radiogroup" aria-label={t("eventForm.questionType")} className="flex flex-wrap gap-1">
                  {QUESTION_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={q.type === type}
                      disabled={locked && q.type !== type}
                      onClick={() => set(i, { type })}
                      className={`h-8 rounded-v2-pill px-3 text-[12.5px] ${
                        q.type === type ? "bg-v2-cream font-v2-ui-semibold text-v2-ink" : "bg-v2-ink3 text-v2-c70 hover:text-v2-cream"
                      }`}
                    >
                      {t(`eventForm.qtypes.${type}`)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={q.required}
                  disabled={locked}
                  onClick={() => set(i, { required: !q.required })}
                  className="inline-flex items-center gap-2 text-[12.5px] text-v2-c70"
                >
                  <span aria-hidden className={`relative h-5 w-8 rounded-v2-pill ${q.required ? "bg-v2-flame" : "bg-v2-ink4"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${q.required ? "translate-x-[14px]" : "translate-x-0.5"}`} />
                  </span>
                  {t("eventForm.required")}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {reusable.length > 0 && (
        <div className="mt-3 px-1">
          <span className="text-[12px] text-v2-c50">{reusableLabel ?? t("eventForm.reuse")}</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {reusable.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => onChange([...questions, copyQuestion(q)])}
                className="inline-flex h-8 max-w-full items-center gap-1 rounded-v2-pill bg-v2-ink4 px-3 text-[12.5px] hover:bg-v2-c16"
              >
                <Icon name="plus" size={14} />
                <span className="truncate">{q.label.trim()}</span>
              </button>
            ))}
            {reusable.length > 1 && (
              <button
                type="button"
                onClick={() => onChange([...questions, ...reusable.map(copyQuestion)])}
                className="inline-flex h-8 items-center rounded-v2-pill bg-v2-ink4 px-3 text-[12.5px] font-v2-ui-semibold hover:bg-v2-c16"
              >
                {t("eventForm.reuseAll")}
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...questions, newQuestionDraft()])}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-v2-pill px-2 text-[13px] font-v2-ui-semibold text-v2-cream hover:bg-v2-ink4"
      >
        <Icon name="plus" size={15} />
        {t("eventForm.addQuestion")}
      </button>
    </div>
  );
}
