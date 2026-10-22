/**
 * Resolves the organization of a v2 organizer route from `?org=<slug>` (or `?orgId=`, v1 links):
 * signed in, member, approved — otherwise back to My organizers, like the web's
 * loadOrganizerContext. Renders `children(organization)` once resolved.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { RequireAuthGate } from "../../hooks/useRequireAuth";
import { findOrganization, useMyOrganizations } from "../../hooks/v2/useOrganizerModel";
import type { MyOrganization } from "../../lib/v2/organizer-api";
import { routes } from "../../lib/v2/routes";
import { ErrorBox, Spinner } from "./ui";

export const firstParam = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

export function OrganizerRoute({ children }: { children: (organization: MyOrganization) => ReactNode }) {
  return (
    <RequireAuthGate>
      <Resolve>{children}</Resolve>
    </RequireAuthGate>
  );
}

function Resolve({ children }: { children: (organization: MyOrganization) => ReactNode }) {
  const params = useLocalSearchParams<{ org?: string | string[]; orgId?: string | string[] }>();
  const slug = firstParam(params.org);
  const orgId = firstParam(params.orgId);
  const { data, isError, refetch } = useMyOrganizations();

  if (!slug && !orgId) return <Redirect href={routes.myOrganizers() as Href} />;
  if (isError && !data) {
    return (
      <View className="flex-1 justify-center bg-v2-ink px-4">
        <ErrorBox onRetry={refetch} />
      </View>
    );
  }
  const organization = findOrganization(data, { slug, id: orgId });
  if (organization === undefined) return <Spinner />;
  if (organization === null) return <Redirect href={routes.myOrganizers() as Href} />;
  return <>{children(organization)}</>;
}
