"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateOrganization } from "../../lib/hooks/useForms";

interface CreateOrganizationFormProps {
  onSuccess?: (organization: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
    owner_user_id: string;
  }) => void;
}

export default function CreateOrganizationForm({
  onSuccess,
}: CreateOrganizationFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
  });

  // Auto-generate slug from name for submission
  const getFormDataForSubmission = () => ({
    name: formData.name.trim(),
    slug: formData.slug,
  });
  const [error, setError] = useState("");

  // React Query mutation for organization creation
  const createOrgMutation = useCreateOrganization();

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleNameChange = (name: string) => {
    setFormData({
      name,
      slug: generateSlug(name),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const submissionData = getFormDataForSubmission();

    // Validate that slug is not empty (prevents names with only symbols/non-Latin chars)
    if (!submissionData.slug || submissionData.slug.trim() === "") {
      setError(
        "Organization name must contain at least one letter or number. Names with only symbols or special characters are not allowed."
      );
      return;
    }

    // Use React Query mutation instead of direct fetch
    createOrgMutation.mutate(submissionData, {
      onSuccess: organization => {
        if (onSuccess) {
          onSuccess(organization);
        } else {
          router.push("/organizer");
        }
      },
      onError: error => {
        setError(error.message || "An error occurred");
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-white-80 text-xs font-poppins-medium">
          Organization Name *
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={e => handleNameChange(e.target.value)}
          placeholder="e.g., Acme Events"
          required
          className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors"
        />
      </div>

      {formData.name.trim() && (
        <div className="flex flex-col gap-1.5">
          <label className="text-white-80 text-xs font-poppins-medium">URL Slug</label>
          <div className="flex items-center gap-2">
            <code className="text-white-100 text-sm font-mono bg-card border border-white-30 rounded-lg px-3 py-2">{formData.slug}</code>
            <span className="text-white-30 text-xs font-poppins">
              This will be your organization&apos;s URL
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-card p-3 text-red-400 text-sm font-poppins">
          {error}
        </div>
      )}

      <div className="mt-2">
        <button
          type="submit"
          disabled={createOrgMutation.isPending || !formData.name.trim()}
          className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed w-full"
        >
          {createOrgMutation.isPending ? "Creating..." : "Create Organization"}
        </button>
      </div>
    </form>
  );
}
