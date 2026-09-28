import { z } from "zod";

const reference = z.string().trim().min(1).max(255);
export const integrationMediaSchema = z.object({
  externalId: reference,
  kind: z.literal("image"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().min(1).max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

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
  media: z.array(integrationMediaSchema).max(10).default([]),
  parentReference: reference.optional(),
  forwardedBy: reference.optional(),
  synthetic: z.boolean().default(false),
}).strict().superRefine((event, context) => {
  const ids = new Set<string>();
  event.media.forEach((item, index) => {
    if (ids.has(item.externalId)) context.addIssue({
      code: "custom", message: "duplicate_media_id", path: ["media", index, "externalId"],
    });
    ids.add(item.externalId);
  });
}).refine(
  (event) => Boolean(event.text?.trim()) || event.media.length > 0,
  { message: "text_or_media_required" },
);

export type IntegrationEvent = z.infer<typeof integrationEventSchema>;
