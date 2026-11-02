"use client";

/**
 * Line-up in create / edit event (fase 4.3). One card per artist: name, and optional Instagram,
 * Spotify and SoundCloud (paste the profile link or the @). Empty cards are ignored on save.
 * Errors come from validateLineup (paths `lineup.<key>.<field>`).
 */
import { LINEUP_MAX, moveItem, newArtistDraft, type ArtistDraft } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { FieldError, Labeled, fieldCls, fieldId } from "./ui";

export function LineupFields({
  value,
  onChange,
  errorText,
  disabled,
}: {
  value: ArtistDraft[];
  onChange: (next: ArtistDraft[]) => void;
  errorText: (path: string) => string | null;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const set = (key: string, patch: Partial<ArtistDraft>) => onChange(value.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const inv = (path: string) => (errorText(path) ? true : undefined);

  return (
    <div className="flex flex-col gap-3">
      {value.map((a, i) => {
        const p = `lineup.${a.key}.`;
        return (
          <div key={a.key} className="rounded-v2-card bg-v2-ink2 p-4" data-testid="artist-card">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-v2-display-bold text-[15px] text-v2-c50 tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-v2-ui-semibold">{a.name.trim() || t("eventForm.lineupArtist")}</span>
              <button
                type="button"
                disabled={disabled || i === 0}
                onClick={() => onChange(moveItem(value, i, -1))}
                aria-label={t("eventForm.lineupMoveUp", { name: a.name || String(i + 1) })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-v2-pill text-v2-c70 hover:bg-v2-ink3 disabled:opacity-30"
              >
                <Icon name="down" size={15} className="rotate-180" />
              </button>
              <button
                type="button"
                disabled={disabled || i === value.length - 1}
                onClick={() => onChange(moveItem(value, i, 1))}
                aria-label={t("eventForm.lineupMoveDown", { name: a.name || String(i + 1) })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-v2-pill text-v2-c70 hover:bg-v2-ink3 disabled:opacity-30"
              >
                <Icon name="down" size={15} />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x.key !== a.key))}
                aria-label={t("eventForm.lineupRemove", { name: a.name || String(i + 1) })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-v2-pill text-v2-c50 hover:bg-v2-ink3 hover:text-v2-cream"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label={t("eventForm.artistName")} htmlFor={fieldId(p + "name")} error={errorText(p + "name")} path={p + "name"}>
                <input
                  id={fieldId(p + "name")}
                  value={a.name}
                  maxLength={80}
                  disabled={disabled}
                  onChange={(e) => set(a.key, { name: e.target.value })}
                  aria-invalid={inv(p + "name")}
                  placeholder={t("eventForm.artistNamePlaceholder")}
                  className={fieldCls}
                />
              </Labeled>
              <Labeled
                label="Instagram"
                optional={t("eventForm.optional")}
                htmlFor={fieldId(p + "instagram")}
                error={errorText(p + "instagram")}
                path={p + "instagram"}
              >
                <input
                  id={fieldId(p + "instagram")}
                  value={a.instagram}
                  disabled={disabled}
                  autoCapitalize="none"
                  onChange={(e) => set(a.key, { instagram: e.target.value })}
                  aria-invalid={inv(p + "instagram")}
                  placeholder="@usuario"
                  className={fieldCls}
                />
              </Labeled>
              <Labeled label="Spotify" optional={t("eventForm.optional")} htmlFor={fieldId(p + "spotify")} error={errorText(p + "spotify")} path={p + "spotify"}>
                <input
                  id={fieldId(p + "spotify")}
                  value={a.spotify}
                  disabled={disabled}
                  inputMode="url"
                  onChange={(e) => set(a.key, { spotify: e.target.value })}
                  aria-invalid={inv(p + "spotify")}
                  placeholder="open.spotify.com/artist/…"
                  className={fieldCls}
                />
              </Labeled>
              <Labeled
                label="SoundCloud"
                optional={t("eventForm.optional")}
                htmlFor={fieldId(p + "soundcloud")}
                error={errorText(p + "soundcloud")}
                path={p + "soundcloud"}
              >
                <input
                  id={fieldId(p + "soundcloud")}
                  value={a.soundcloud}
                  disabled={disabled}
                  inputMode="url"
                  onChange={(e) => set(a.key, { soundcloud: e.target.value })}
                  aria-invalid={inv(p + "soundcloud")}
                  placeholder="soundcloud.com/…"
                  className={fieldCls}
                />
              </Labeled>
            </div>
          </div>
        );
      })}
      {value.length < LINEUP_MAX && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...value, newArtistDraft()])}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-v2-card border border-dashed border-v2-c10 text-[14px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink2"
        >
          <Icon name="plus" size={16} />
          {t("eventForm.addArtist")}
        </button>
      )}
      <FieldError path="lineup" message={errorText("lineup")} />
    </div>
  );
}
