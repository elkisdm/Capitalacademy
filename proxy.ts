import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/classroom/:path*",
    "/docente/:path*",
    "/onboarding/:path*",
    "/api/admin/:path*",
    "/api/classroom/:path*",
    "/api/onboarding/:path*",
    "/api/support",
    "/api/video-proxy",
  ],
};
