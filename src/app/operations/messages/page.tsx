import { AppShell } from "@/components/app-shell";
import { UnassignedMessageInbox } from "@/components/unassigned-message-inbox";
import { listUnassignedMessages } from "@/integrations/messages/supabase-org-message-inbox";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function UnassignedMessagesPage() {
  let access: Awaited<ReturnType<typeof getAppAccessContext>>;
  let messages: Awaited<ReturnType<typeof listUnassignedMessages>> = [];
  try {
    const client = await createSupabaseServerClient();
    access = await getAppAccessContext(client);
    if (access.role === "organization_administrator")
      messages = await listUnassignedMessages(client, access.organizationId);
  } catch {
    return <AppShell currentPath="/operations/messages"><section className="accessState"><h1>Message inbox unavailable</h1><p>Sign in as a Director or try again when the inbox is available.</p></section></AppShell>;
  }
  if (access.role !== "organization_administrator") {
    return <AppShell authenticated currentPath="/operations/messages" role={access.role} roleLabel={access.roleLabel}>
      <section className="accessState"><h1>Message inbox restricted</h1><p>Only an organization Director can resolve messages without a verified casino.</p></section>
    </AppShell>;
  }
  return <AppShell authenticated currentPath="/operations/messages" role={access.role} roleLabel={access.roleLabel}>
    <UnassignedMessageInbox messages={messages} sites={access.sites} />
  </AppShell>;
}
