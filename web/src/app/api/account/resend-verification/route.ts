import type { NextRequest } from "next/server";
import { z } from "zod";

import { accountEmailRequest } from "@/lib/account-email";
import { validOrigin } from "@/lib/origin";
import { privateToken } from "@/lib/private-token";

export async function POST(request: NextRequest) {
  if (!validOrigin(request))
    return Response.json({ title: "Forbidden" }, { status: 403 });
  const token = await privateToken(request);
  if (!token?.accessToken || token.error)
    return Response.json({ title: "Unauthenticated" }, { status: 401 });
  return accountEmailRequest(
    request,
    "resend-verification",
    z.object({}),
    `Bearer ${token.accessToken}`,
  );
}
