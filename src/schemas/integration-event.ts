import { z } from "zod";

const reference = z.string().trim().min(1).max(255);

export const integrationEventSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  sourceAccountId: z.string().trim().min(1).max(160),
  externalEventId: reference,
  externalMessageId: reference.optional(),
  threadId: reference.optional(),
  senderReference: reference.optional(),
  occurredAt: z.string().datetime({ offset: true }),
  text: z.string().max(8000).optional(),
  media: z.array(z.object({
    externalId: reference,
    kind: z.enum(["image", "document", "video", "audio"]),
    mimeType: z.string().trim().min(1).max(120).optional(),
  }).strict()).max(10).default([]),
  parentReference: reference.optional(),
  forwardedBy: reference.optional(),
  synthetic: z.boolean().default(false),
}).strict().refine(
  (event) => Boolean(event.text?.trim()) || event.media.length > 0,
  { message: "text_or_media_required" },
);

export type IntegrationEvent = z.infer<typeof integrationEventSchema>;
