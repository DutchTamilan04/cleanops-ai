import { AppShell } from "@/components/app-shell";
import { OperationsCommand } from "@/components/operations-command";
import { SitePortfolio } from "@/components/site-portfolio";
import { Alert } from "@/components/ui/alert";
import { getOperationsWorkspace } from "@/integrations/operations/supabase-operations";
import { getSitePortfolio } from "@/integrations/operations/supabase-site-portfolio";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, type AppAccessContext } from "@/services/access-context";
import { getOperationsRuntime, hasOperationsFixture } from "@/services/operations-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  portfolio: Awaited<ReturnType<typeof getSitePortfolio>>;
};

export default async function OperationsPage() {
  // #186: only a failure to establish the session or the casino portfolio means "sign in".
  let loaded: Loaded | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const portfolio = await getSitePortfolio(client, access.sites);
    loaded = { access, portfolio };
  } catch {}

  if (!loaded) {
    return <AppShell currentPath="/operations"><section className="accessState"><p className="eyebrow">Operations command</p><h1>Sign in required</h1><p>Use an authorized CleanOps demo account.</p><a className="ui-button ui-button-primary" href="/login">Sign in</a></section></AppShell>;
  }
  const { access, portfolio } = loaded;
  if (!access.canManageOperations) {
    return <AppShell authenticated currentPath="/operations" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Operations command</p><h1>Operations access restricted</h1><p>This role does not manage casino operations.</p></section></AppShell>;
  }

  // The live walkthrough panel is optional: if it cannot load, the portfolio still shows.
  let workspace: Awaited<ReturnType<typeof getOperationsWorkspace>> | null = null;
  let workspaceUnavailable = false;
  if (hasOperationsFixture(access)) {
    try {
      const operations = await getOperationsRuntime("supervisor");
      workspace = await getOperationsWorkspace(operations.accessClient);
    } catch (error) {
      workspaceUnavailable = true;
      console.error("Operations workspace load failed", error instanceof Error ? error.message : error);
    }
  }
  return <AppShell authenticated currentPath="/operations" role={access.role} roleLabel={access.roleLabel}>
    <SitePortfolio portfolio={portfolio} />
    {workspace ? <OperationsCommand workspace={workspace} /> : null}
    {workspaceUnavailable ? <section className="sitePortfolio"><Alert tone="info">The live operations walkthrough is unavailable for this account right now. The casino portfolio above is current.</Alert></section> : null}
  </AppShell>;
}
