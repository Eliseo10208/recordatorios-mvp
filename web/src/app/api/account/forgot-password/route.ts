import { z } from "zod";

import { accountEmailRequest } from "@/lib/account-email";

export async function POST(request: Request) {
  return accountEmailRequest(
    request,
    "forgot-password",
    z.object({ email: z.email().max(254) }),
  );
}
