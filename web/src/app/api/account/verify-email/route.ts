import { z } from "zod";

import { accountEmailRequest } from "@/lib/account-email";

export async function POST(request: Request) {
  return accountEmailRequest(
    request,
    "verify-email",
    z.object({ token: z.string().min(40).max(128) }),
  );
}
