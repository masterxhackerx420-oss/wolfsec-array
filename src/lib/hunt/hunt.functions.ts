import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const HuntInput = z.object({
  query: z.string().trim().min(2).max(160),
  mode: z.enum(["hunt", "username"]),
  engines: z.array(z.string()).max(60).optional(),
});

export const runHunt = createServerFn({ method: "POST" })
  .validator((data: unknown) => HuntInput.parse(data))
  .handler(async ({ data }) => {
    const { executeHunt } = await import("./engines.server");
    return executeHunt(data);
  });
