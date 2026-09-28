"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { performUnassignedMessageResolution } from "@/app/operations/messages/actions";
import type { UnassignedMessage } from "@/integrations/messages/supabase-org-message-inbox";
import type { AccessSite } from "@/services/access-context";
import { formatUtcTimestamp } from "@/lib/format-utc-timestamp";
import { Alert, Button, SelectField, StatusBadge, TextField } from "@/components/ui";

export function UnassignedMessageInbox({ messages, sites }: {
  messages: UnassignedMessage[]; sites: AccessSite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const active = messages.filter((message) => message.resolution_status !== "rejected");

  return <section className="messageQueue" aria-labelledby="unassigned-message-title">
    <header className="messageQueueHeader">
      <div>
        <p className="eyebrow">Organization intake</p>
        <h1 id="unassigned-message-title">Unassigned messages</h1>
        <p>Review the source and assign a casino before a site reviewer links a task or worker. Reject messages that cannot be safely assigned. Message text and sender names are untrusted.</p>
      </div>
      <StatusBadge tone="pending">{active.length} awaiting site</StatusBadge>
    </header>
    {notice ? <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert> : null}
    {pending ? <Alert tone="info">Saving review…</Alert> : null}
    {active.length ? <div className="messageQueueList">{active.map((message) =>
      <article className="messageQueueItem" key={message.context_id}>
        <div className="messageQueueBody">
          <div><strong>{message.sender_id}</strong><time dateTime={message.occurred_at}>{formatUtcTimestamp(message.occurred_at)}</time></div>
          <p>{message.text_content ?? "Media-only message"}</p>
          <p>Suggested intent: {message.intent_kind.replaceAll("_", " ")} · {message.media_count} media item(s)</p>
          {message.forwarded_by ? <p>Forwarded by: {message.forwarded_by}. Original sender remains the source reference above.</p> : null}
        </div>
        <form className="messageResolutionForm" onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const action = submitter?.value === "reject" ? "reject" : "assign";
          const fields = new FormData(event.currentTarget);
          const selectedSite = String(fields.get("siteId") ?? "");
          setNotice(null);
          startTransition(async () => {
            const result = await performUnassignedMessageResolution({
              contextId: message.context_id, action,
              siteId: action === "assign" ? selectedSite || null : null,
              reason: String(fields.get("reason") ?? ""),
            });
            setNotice(result);
            if (result.ok) router.refresh();
          });
        }}>
          <SelectField label="Casino" name="siteId" defaultValue="">
            <option value="">Choose casino</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </SelectField>
          <TextField label="Review reason" name="reason" minLength={3} maxLength={500} required />
          <Button type="submit" name="decision" value="assign" disabled={pending}>Assign casino</Button>
          <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>Reject message</Button>
        </form>
      </article>
    )}</div> : <div className="reviewEmpty"><h2>No unassigned messages</h2><p>Messages with a verified casino continue to the site context queue.</p></div>}
  </section>;
}
