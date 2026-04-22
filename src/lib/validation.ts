import { z } from 'zod';

export const waitlistSchema = z.object({
  email: z.string().email().max(200),
  domain: z
    .string()
    .trim()
    .max(200)
    .regex(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i, 'Invalid domain')
    .optional()
    .or(z.literal('')),
  keywordCount: z.coerce.number().int().min(0).max(10000).optional(),
  role: z.enum(['in-house', 'agency', 'content', 'founder', 'other']).optional(),
  source: z.string().max(100).optional(),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;
