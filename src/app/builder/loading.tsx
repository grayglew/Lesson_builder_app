import { LoaderCircle } from "lucide-react";

export default function BuilderLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 text-slate-700">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <LoaderCircle className="size-5 animate-spin text-teal-700" aria-hidden />
        Loading the lesson builder&hellip;
      </div>
    </main>
  );
}
