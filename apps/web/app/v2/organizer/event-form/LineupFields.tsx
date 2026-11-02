"use client";

/**
 * Line-up in create / edit event (fase 4.3). One card per artist: name, and optional Instagram,
 * Spotify and SoundCloud (paste the profile link or the @). Empty cards are ignored on save.
 * Errors come from validateLineup (paths `lineup.<key>.<field>`).
 * Photo (2026-11-02): a small thumbnail with a pencil in the corner; the pencil opens the options
 * (photo from Spotify / SoundCloud using the links typed below, upload one, remove). No extra
 * room on screen. Instagram is shown disabled: it doesn't let anyone read profile pictures.
 */
import { useEffect, useRef, useState } from "react";
import { artistInitials, LINEUP_MAX, moveItem, newArtistDraft, normalizeSoundcloud, normalizeSpotify, type ArtistDraft } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { FieldError, Labeled, fieldCls, fieldId } from "./ui";

/** Center-crop to a 600×600 JPEG in the browser (keeps uploads small and square). */
async function squareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 600;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 600, 600);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode"))), "image/jpeg", 0.86));
}

async function readError(res: Response, fallback: string) {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || fallback;
  } catch {
    return fallback;
  }
}

function ArtistPhoto({
  artist,
  organizationId,
  disabled,
  onPhoto,
}: {
  artist: ArtistDraft;
  organizationId: string;
  disabled?: boolean;
  onPhoto: (url: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spotify = normalizeSpotify(artist.spotify);
  const soundcloud = normalizeSoundcloud(artist.soundcloud);
  const okSpotify = !!spotify && spotify !== "invalid";
  const okSoundcloud = !!soundcloud && soundcloud !== "invalid";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const run = async (req: () => Promise<Response>) => {
    setBusy(true);
    setError(null);
    setOpen(false);
    try {
      const res = await req();
      if (!res.ok) throw new Error(await readError(res, t("eventForm.photoError")));
      const { photo_url } = (await res.json()) as { photo_url: string };
      onPhoto(photo_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("eventForm.photoError"));
    } finally {
      setBusy(false);
    }
  };
  const fromSource = (source: "spotify" | "soundcloud", url: string) =>
    run(() =>
      fetch("/api/organizer/lineup-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, source, url }),
      })
    );
  const upload = (file: File) =>
    run(async () => {
      const body = new FormData();
      body.append("organizationId", organizationId);
      body.append("file", new File([await squareJpeg(file)], "artist.jpg", { type: "image/jpeg" }));
      return fetch("/api/organizer/lineup-photo", { method: "POST", body });
    });

  const item = "flex w-full items-center gap-2 rounded-v2-sm px-3 py-2 text-left text-[13.5px] hover:bg-v2-ink4 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div ref={box} className="relative shrink-0">
      <div className={`h-11 w-11 overflow-hidden rounded-[10px] bg-v2-ink3 ${busy ? "animate-pulse" : ""}`}>
        {artist.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- our storage
          <img src={artist.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-v2-display-bold text-[14px] text-v2-c70">
            {artist.name.trim() ? artistInitials(artist.name) : "?"}
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("eventForm.photoEdit", { name: artist.name || t("eventForm.lineupArtist") })}
        className="absolute -bottom-1.5 -right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-v2-ink2 bg-v2-cream text-v2-ink disabled:opacity-50"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 20h4L19 9l-4-4L4 16v4z" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-12 z-20 w-[250px] rounded-v2-md border border-v2-c10 bg-v2-ink3 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <button type="button" role="menuitem" disabled={!okSpotify} onClick={() => fromSource("spotify", artist.spotify)} className={item}>
            {t("eventForm.photoFromSpotify")}
          </button>
          <button type="button" role="menuitem" disabled={!okSoundcloud} onClick={() => fromSource("soundcloud", artist.soundcloud)} className={item}>
            {t("eventForm.photoFromSoundcloud")}
          </button>
          <button type="button" role="menuitem" disabled className={item} title={t("eventForm.photoInstagramNo")}>
            {t("eventForm.photoFromInstagram")}
          </button>
          <button type="button" role="menuitem" onClick={() => fileRef.current?.click()} className={item}>
            {t("eventForm.photoUpload")}
          </button>
          {artist.photo && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPhoto("");
              }}
              className={`${item} text-v2-errorText`}
            >
              {t("eventForm.photoRemove")}
            </button>
          )}
          {(!okSpotify || !okSoundcloud) && <p className="px-3 pb-1 pt-1.5 text-[11.5px] leading-snug text-v2-c50">{t("eventForm.photoHint")}</p>}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-testid={`artist-photo-file-${artist.key}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      {error && (
        <p role="alert" className="absolute left-0 top-12 z-10 w-[220px] rounded-v2-sm bg-v2-ink3 px-2.5 py-1.5 text-[12px] text-v2-errorText">
          {error}
        </p>
      )}
    </div>
  );
}

export function LineupFields({
  value,
  onChange,
  errorText,
  disabled,
  organizationId,
}: {
  value: ArtistDraft[];
  onChange: (next: ArtistDraft[]) => void;
  errorText: (path: string) => string | null;
  disabled?: boolean;
  /** For the artist photos (stored under the organization). */
  organizationId: string;
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
            <div className="mb-3 flex items-center gap-3">
              <ArtistPhoto artist={a} organizationId={organizationId} disabled={disabled} onPhoto={(photo) => set(a.key, { photo })} />
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
