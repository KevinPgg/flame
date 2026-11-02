"use client";

/**
 * /invite/<token> (fase 4.5): who invited you and as what; Accept / Decline when you're signed in
 * with the invited e-mail; otherwise sign in / create the account with that e-mail and come back.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useI18n } from "../../../../lib/i18n";
import { OrgAvatar } from "../../../components/OrgAvatar";
import { Skeleton } from "../../../components/Skeleton";
import { apiErrorMessage } from "../../../lib/api-error";

type Info = {
  organization: { id: string; name: string; slug: string; logo_url: string | null } | null;
  role: "admin" | "organizer";
  email: string;
  state: "pending" | "expired" | "accepted" | "declined" | "cancelled";
};

const btn = "inline-flex h-11 items-center justify-center rounded-v2-pill px-5 text-[14px] font-v2-ui-semibold";

export default function InviteView({ token }: { token: string }) {
  const { t } = useI18n();
  const { isLoaded, isSignedIn, user } = useUser();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "accepted" | "declined">(null);
  const [error, setError] = useState<string | null>(null);
  const back = `/invite/${encodeURIComponent(token)}`;

  useEffect(() => {
    let alive = true;
    fetch(`/api/invitations/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Info) : null))
      .then((d) => alive && (d ? setInfo(d) : setMissing(true)))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [token]);

  const answer = async (action: "accept" | "decline") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, t("errors.generic")));
      setDone(action === "accept" ? "accepted" : "declined");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const myEmails = (user?.emailAddresses ?? []).map((e) => e.emailAddress.toLowerCase());
  const rightAccount = !!info && myEmails.includes(info.email.toLowerCase());
  const org = info?.organization;
  const role = info ? t(`organizer.roles.${info.role}`) : "";

  return (
    <div className="mx-auto flex max-w-[460px] flex-col items-center px-4 py-14 text-center">
      <h1 className="font-v2-display-bold text-[26px] tracking-[-0.03em]">{t("invites.pageTitle")}</h1>
      {!info && !missing ? (
        <div className="mt-8 flex w-full flex-col items-center gap-3">
          <Skeleton className="h-20 w-20 !rounded-[18px]" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : missing || !org ? (
        <p className="mt-6 text-[15px] text-v2-c70">{t("invites.gone")}</p>
      ) : (
        <>
          <span className="mt-8">
            <OrgAvatar name={org.name} logoUrl={org.logo_url} size={80} />
          </span>
          <p className="mt-4 text-[16px] leading-snug">{t("invites.pageBody", { org: org.name, role })}</p>
          <p className="mt-1 text-[13px] text-v2-c50">{t("invites.pageFor", { email: info!.email })}</p>

          {done === "accepted" ? (
            <div className="mt-8 flex flex-col items-center gap-3">
              <p role="status" className="text-[15px] text-v2-good">{t("invites.accepted", { org: org.name })}</p>
              <Link href={`/v2/organizer?org=${encodeURIComponent(org.slug)}`} className={`${btn} bg-v2-cream text-v2-ink`}>
                {t("invites.openTeam")}
              </Link>
            </div>
          ) : done === "declined" ? (
            <p role="status" className="mt-8 text-[15px] text-v2-c70">{t("invites.declined")}</p>
          ) : info!.state === "expired" ? (
            <p className="mt-8 text-[15px] text-v2-warn">{t("invites.goneExpired")}</p>
          ) : info!.state !== "pending" ? (
            <p className="mt-8 text-[15px] text-v2-c70">{t("invites.goneAnswered")}</p>
          ) : !isLoaded ? null : !isSignedIn ? (
            <div className="mt-8 flex flex-col items-center gap-3">
              <p className="text-[14px] text-v2-c70">{t("invites.signInToAnswer", { email: info!.email })}</p>
              <div className="flex gap-2">
                <Link href={`/sign-in?redirect_url=${encodeURIComponent(back)}`} className={`${btn} bg-v2-cream text-v2-ink`}>
                  {t("userSettings.signIn")}
                </Link>
                <Link href={`/sign-up?redirect_url=${encodeURIComponent(back)}`} className={`${btn} bg-v2-ink3 text-v2-cream`}>
                  {t("invites.createAccount")}
                </Link>
              </div>
            </div>
          ) : !rightAccount ? (
            <p className="mt-8 text-[14px] text-v2-warn">{t("invites.wrongAccount", { email: info!.email })}</p>
          ) : (
            <div className="mt-8 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void answer("decline")} className={`${btn} bg-v2-ink3 text-v2-cream disabled:opacity-50`}>
                {t("invites.decline")}
              </button>
              <button type="button" disabled={busy} onClick={() => void answer("accept")} className={`${btn} bg-v2-cream text-v2-ink disabled:opacity-50`}>
                {t("invites.accept")}
              </button>
            </div>
          )}
          {error && <p role="alert" className="mt-4 text-[13px] text-v2-errorText">{error}</p>}
        </>
      )}
    </div>
  );
}
