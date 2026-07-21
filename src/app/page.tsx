import { redirect } from "next/navigation";
import { getAuthorizedAppContext } from "@/lib/auth/app-users";
import { preferredBuilderPath } from "@/lib/builder-v2/access";

export default async function Home() {
  const context = await getAuthorizedAppContext();

  if ("response" in context) {
    redirect("/login");
  }

  redirect(preferredBuilderPath(context.actorProfile));
}
