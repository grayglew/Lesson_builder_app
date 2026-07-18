import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppUserProfile, isActiveProfile } from "@/lib/auth/app-users";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  const isBuilder = pathname === "/builder" || pathname === "/builder/" || pathname === "/builder/index.html";
  const isBuilderV2 = pathname === "/builder-v2" || pathname.startsWith("/builder-v2/");
  const isLegacyLessonsRoute = pathname.startsWith("/lessons");
  const isAdminRoute = pathname.startsWith("/admin");
  const isProtected = isBuilder || isBuilderV2 || isLegacyLessonsRoute || isAdminRoute;

  if (!isProtected) {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const { profile, error: profileError } = await getAppUserProfile(supabase, user.id);
  if (profileError || !isActiveProfile(profile)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.delete("next");
    url.searchParams.set("message", "This Lesson Builder account is not active.");
    return NextResponse.redirect(url);
  }

  if (isAdminRoute && profile.role !== "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/builder/index.html";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isLegacyLessonsRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/builder/index.html";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
