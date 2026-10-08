"use client";

import { useState, useRef, useMemo, useEffect, useId } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { FiArrowLeft, FiCamera, FiTrash2 } from "react-icons/fi";
import { useClerk } from "@clerk/nextjs";
import { canManagePayouts, type OrgMemberRole } from "@project-flame/lib";
import StripeConnectStatus from "../../components/StripeConnectStatus";

type SettingsTab = "personal" | "organization" | "payouts";

const EXPECTED_ORG_IMAGE_PUBLIC_PREFIX = "/object/public/organization-images/";

interface OrgSettingsClientProps {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailAddresses: { emailAddress: string }[];
    imageUrl: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    approved?: boolean;
  };
  organizationDetails: {
    id: string;
    name: string;
    slug: string;
    instagram_handle?: string | null;
    city?: string | null;
    description?: string | null;
    logo_url?: string | null;
  } | null;
  memberRole?: string | null;
}

function SettingsField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-white-50 text-xs font-poppins-medium">{label}</span>
      <div className="bg-white-5 border border-white-20 rounded-card px-4 py-3">
        <span className="text-white-100 text-sm font-poppins">{value || "—"}</span>
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-white-50 text-xs font-poppins-medium"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="bg-white-5 border border-white-20 rounded-card px-4 py-3 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50 transition-colors"
      />
    </div>
  );
}

function EditableTextArea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-white-50 text-xs font-poppins-medium"
        >
          {label}
        </label>
        <span className="text-white-50 text-xs font-poppins">
          {value.length}/{maxLength}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        rows={4}
        className="bg-white-5 border border-white-20 rounded-card px-4 py-3 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50 transition-colors resize-none"
      />
    </div>
  );
}

export default function OrgSettingsClient({
  user,
  organization,
  organizationDetails,
  memberRole,
}: OrgSettingsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signOut } = useClerk();

  const showPayouts = canManagePayouts(memberRole as OrgMemberRole | null);

  const tabs = useMemo<{ id: SettingsTab; label: string }[]>(() => [
    { id: "personal", label: "Personal" },
    { id: "organization", label: "Organization" },
    ...(showPayouts ? [{ id: "payouts" as SettingsTab, label: "Payouts" }] : []),
  ], [showPayouts]);

  const allowedIds = useMemo(() => tabs.map(t => t.id), [tabs]);
  const initialTab = (searchParams.get("tab") as SettingsTab) || "personal";
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    allowedIds.includes(initialTab) ? initialTab : "personal"
  );

  useEffect(() => {
    if (!allowedIds.includes(activeTab)) {
      setActiveTab("personal");
    }
  }, [allowedIds, activeTab]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(
    organizationDetails?.logo_url ?? null
  );
  const [uploading, setUploading] = useState(false);

  // Editable org fields — initialized from server props, controlled locally.
  const [instagram, setInstagram] = useState(
    organizationDetails?.instagram_handle ?? "",
  );
  const [city, setCity] = useState(organizationDetails?.city ?? "");
  const [description, setDescription] = useState(
    organizationDetails?.description ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );

  // Wraps a field setter to also clear the "Saved" badge so it doesn't
  // claim freshness after a subsequent edit.
  const wrapFieldSetter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setSaveStatus(prev => (prev === "saved" ? "idle" : prev));
  };

  const canEditOrg =
    memberRole === "owner" || memberRole === "admin";

  const handleSaveOrg = async () => {
    if (!canEditOrg || saving) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram_handle: instagram || null,
          city: city || null,
          description: description || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      setSaveStatus("saved");
      router.refresh();
    } catch (err) {
      console.error("[OrgSettingsClient] save failed", {
        action: "saveOrgSettings",
        orgId: organization.id,
        orgSlug: organization.slug,
        userId: user.id,
        error: err,
        stack: err instanceof Error ? err.stack : undefined,
      });
      setSaveStatus("error");
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
  const email = user.emailAddresses[0]?.emailAddress || "—";

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("organizationSlug", organization.slug);
      formData.append("type", "logo");

      const res = await fetch("/api/upload-org-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setLogoUrl(data.url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteLogo = async () => {
    if (!logoUrl) return;
    if (!confirm("Are you sure you want to remove the organization logo?")) return;

    setUploading(true);
    try {
      const urlObj = new URL(logoUrl);
      if (!urlObj.pathname.startsWith(EXPECTED_ORG_IMAGE_PUBLIC_PREFIX)) {
        throw new Error(
          `Logo URL path must start with ${EXPECTED_ORG_IMAGE_PUBLIC_PREFIX}`,
        );
      }
      const storagePath = urlObj.pathname.slice(
        EXPECTED_ORG_IMAGE_PUBLIC_PREFIX.length,
      );
      if (!storagePath.trim()) throw new Error("Invalid logo URL: empty storage path");

      const res = await fetch(
        `/api/upload-org-image?path=${encodeURIComponent(storagePath)}&type=logo`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }

      setLogoUrl(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete logo");
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Sign out failed:", { action: "signOut", error });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[800px] mx-auto px-4 pt-24 pb-16 flex flex-col gap-6">
        {/* Back button */}
        <button
          onClick={() => {
            const orgSlug = searchParams.get("org");
            router.push(orgSlug ? `/organizer?org=${encodeURIComponent(orgSlug)}` : "/organizer");
          }}
          className="flex items-center gap-2 text-white-100 text-sm font-poppins bg-transparent border-none cursor-pointer p-0 w-fit hover:text-white-80 transition-colors"
        >
          <FiArrowLeft size={20} />
          Go Back
        </button>

        {/* Tab bar — matches mobile SettingsTabs */}
        <div className="flex items-center gap-[6px] border-b border-white-20">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 text-center py-2 text-base leading-[22px] font-poppins transition-colors cursor-pointer bg-transparent border-none ${
                  isActive
                    ? "text-white-100 font-poppins-semibold border-b-2 border-white-100 -mb-px"
                    : "text-white-80"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "personal" && (
          <div className="flex flex-col gap-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-white-10 flex items-center justify-center relative">
                {user.imageUrl ? (
                  <Image
                    src={user.imageUrl}
                    alt="Profile"
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <span className="text-white-50 text-3xl font-poppins-semibold">
                    {(fullName?.[0] ?? "?").toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <h2 className="text-white-100 text-lg font-poppins-semibold uppercase m-0">
                Personal Information
              </h2>
              <div className="flex flex-col gap-4">
                <SettingsField label="Full Name" value={fullName} />
                <SettingsField label="Email" value={email} />
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full bg-white-100 rounded-pill py-2.5 text-dark text-sm font-poppins-medium cursor-pointer hover:opacity-90 transition-opacity border-none"
            >
              Sign Out
            </button>
          </div>
        )}

        {activeTab === "organization" && (
          <div className="flex flex-col gap-6">
            {/* Org logo — read-only for non-admin members; upload/delete gated by canEditOrg */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                {canEditOrg ? (
                  <button
                    type="button"
                    className="relative w-24 h-24 rounded-full overflow-hidden bg-white-10 flex items-center justify-center cursor-pointer group"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload organization logo"
                  >
                    {uploading ? (
                      <div className="w-full h-full flex items-center justify-center bg-black/50">
                        <div className="w-6 h-6 border-2 border-white-100 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : logoUrl ? (
                      <Image
                        src={logoUrl}
                        alt={organization.name}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-white-50 text-3xl font-poppins-semibold">
                        {organization.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <FiCamera size={24} className="text-white-100" />
                    </div>
                  </button>
                ) : (
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-white-10 flex items-center justify-center">
                    {logoUrl ? (
                      <Image
                        src={logoUrl}
                        alt={organization.name}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-white-50 text-3xl font-poppins-semibold">
                        {organization.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
                {canEditOrg && logoUrl && !uploading && (
                  <button
                    onClick={handleDeleteLogo}
                    aria-label="Delete logo"
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white-100 flex items-center justify-center cursor-pointer border-2 border-background hover:bg-white-80 transition-colors"
                  >
                    <FiTrash2 size={14} className="text-dark" />
                  </button>
                )}
              </div>
              {canEditOrg && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              )}
            </div>

            <div className="flex flex-col gap-5">
              <h2 className="text-white-100 text-lg font-poppins-semibold uppercase m-0">
                Organization Details
              </h2>
              <div className="flex flex-col gap-4">
                <SettingsField
                  label="Company Name"
                  value={organizationDetails?.name || organization.name}
                />
                {canEditOrg ? (
                  <>
                    <EditableField
                      label="Instagram"
                      value={instagram}
                      onChange={wrapFieldSetter(setInstagram)}
                      placeholder="username (without @)"
                      maxLength={30}
                    />
                    <EditableField
                      label="City"
                      value={city}
                      onChange={wrapFieldSetter(setCity)}
                      placeholder="e.g. Guayaquil"
                      maxLength={100}
                    />
                    <EditableTextArea
                      label="Description"
                      value={description}
                      onChange={wrapFieldSetter(setDescription)}
                      placeholder="Tell people about your organization..."
                      maxLength={500}
                    />
                    <div className="flex items-center justify-end gap-3 mt-2">
                      {saveStatus === "saved" && (
                        <span className="text-green-400 text-xs font-poppins-medium">
                          Saved
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveOrg}
                        disabled={saving}
                        className="bg-white-100 text-dark font-poppins-medium text-sm rounded-pill px-6 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <SettingsField label="Instagram" value={instagram} />
                    <SettingsField label="City" value={city} />
                    <SettingsField label="Description" value={description} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "payouts" && (
          <div className="flex flex-col gap-6">
            <h2 className="text-white-100 text-lg font-poppins-semibold uppercase m-0">
              Payouts
            </h2>
            <StripeConnectStatus
              organizationId={organization.id}
              organizationName={organization.name}
            />
          </div>
        )}
      </div>
    </div>
  );
}
