import { z } from "zod";

export const SIDECAR_VERSION = 1;

export const CommentStatusSchema = z.enum(["open", "resolved", "orphaned"]);
export const PrioritySchema = z.enum(["low", "medium", "high"]);

export const AnchorSchema = z.object({
  quote: z.string().min(1),
  prefix: z.string(),
  suffix: z.string(),
  startHint: z.number().int().nonnegative(),
  endHint: z.number().int().nonnegative(),
  currentStart: z.number().int().nonnegative().nullable().optional(),
  currentEnd: z.number().int().nonnegative().nullable().optional()
});

export const CommentItemSchema = z.object({
  id: z.string().min(1),
  author: z.string().min(1),
  body: z.string().min(1),
  createdAt: z.string().datetime(),
  editedAt: z.string().datetime().nullable()
});

export const ThreadSchema = z.object({
  id: z.string().min(1),
  status: CommentStatusSchema,
  anchor: AnchorSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  comments: z.array(CommentItemSchema),
  tags: z.array(z.string().min(1)),
  priority: PrioritySchema.optional()
});

export const SidecarSchema = z.object({
  version: z.literal(SIDECAR_VERSION),
  targetFile: z.string().min(1),
  updatedAt: z.string().datetime(),
  threads: z.array(ThreadSchema)
});

export type CommentStatus = z.infer<typeof CommentStatusSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type AnchorData = z.infer<typeof AnchorSchema>;
export type CommentItem = z.infer<typeof CommentItemSchema>;
export type ThreadRecord = z.infer<typeof ThreadSchema>;
export type CommentSidecar = z.infer<typeof SidecarSchema>;

export function parseSidecar(input: unknown): CommentSidecar {
  return SidecarSchema.parse(input);
}

export function createEmptySidecar(targetFile: string): CommentSidecar {
  return {
    version: SIDECAR_VERSION,
    targetFile,
    updatedAt: new Date().toISOString(),
    threads: []
  };
}
