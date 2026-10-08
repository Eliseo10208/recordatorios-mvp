import { z } from "zod";

import { accountEmailRequest } from "@/lib/account-email";

export async function POST(request: Request) {
  return accountEmailRequest(
    request,
    "reset-password",
    z.object({
      token: z.string().min(40).max(128),
      new_password: z.string().min(12).max(128),
    }),
  );
}
