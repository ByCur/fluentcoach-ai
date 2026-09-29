import { z } from 'zod';

export const healthResponseSchema = z.object({ status: z.enum(['ok', 'not-ready']), service: z.string() });
export type HealthResponse = z.infer<typeof healthResponseSchema>;
