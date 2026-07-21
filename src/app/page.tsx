import { redirect } from "next/navigation";
import { BUILDER_ENTRY_PATH } from "@/lib/builder/access";

export default function Home() {
  redirect(BUILDER_ENTRY_PATH);
}
