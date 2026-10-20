import { z } from "zod"

export const GbfsConfigSchema = z.strictObject({
  /** The GBFS auto-discovery file (`gbfs.json`). */
  url: z.string().url(),
  /** Which language's feeds to use. Defaults to the first one listed. */
  language: z.string().optional(),
  headers: z.record(z.string()).default({}),
})

export type GbfsConfig = z.infer<typeof GbfsConfigSchema>
