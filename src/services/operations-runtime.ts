import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDemoIngressConfig } from "@/services/demo-ingress-auth";
import { hasHostedDemoAccess, isHostedDemoEnabled, type HostedDemoCapability } from "@/services/hosted-demo";

export const DEMO_ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
export const DEMO_SITE_ID = "40000000-0000-4000-8000-000000000001";
export const DEMO_SHIFT_ID = "90000000-0000-4000-8000-000000000001";
export const DEMO_MOBILE_TASK_ID = "81000000-0000-4000-8000-000000000004";
export const DEMO_WORKER_ID = "60000000-0000-4000-8000-000000000001";

/**
 * #186: the fixed live-operations walkthrough exists only in the demo organization. A Director of any
 * other organization (for example a generated scenario) must not be sent to it.
 */
export function hasOperationsFixture(access: { organizationId: string; sites: { id: string }[] }) {
  return access.organizationId === DEMO_ORGANIZATION_ID && access.sites.some((site) => site.id === DEMO_SITE_ID);
}

export type OperationsRuntime = {
  accessClient: SupabaseClient;
  writeClient: SupabaseClient;
  actorUserId: string;
  demo: boolean;
};

export async function getOperationsRuntime(capability: HostedDemoCapability = "supervisor"): Promise<OperationsRuntime> {
  const demo = getDemoIngressConfig().enabled;
  const accessClient = await createSupabaseServerClient();
  const { data, error } = await accessClient.auth.getClaims();
  const actorUserId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !actorUserId) throw new Error("Authentication required.");
  if (demo) {
    if (!await hasHostedDemoAccess(accessClient, actorUserId, capability, false)) throw new Error("Role access required.");
    const writeClient = createPrivilegedSupabaseClient();
    return { accessClient: writeClient, writeClient, actorUserId, demo: true };
  }
  const hostedDemo = await hasHostedDemoAccess(accessClient, actorUserId, capability);
  if (isHostedDemoEnabled() && !hostedDemo) throw new Error("Role access required.");
  return {
    accessClient,
    writeClient: hostedDemo ? createPrivilegedSupabaseClient() : accessClient,
    actorUserId,
    demo: hostedDemo,
  };
}
