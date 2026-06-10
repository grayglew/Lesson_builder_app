import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, BookOpen, CalendarDays, Copy, LogOut, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { archiveLesson, createLesson, duplicateLesson } from "./actions";
import { signOut } from "../login/actions";

type LessonsPageProps = {
  searchParams: Promise<{
    message?: string;
  }>;
};

type LessonRow = {
  id: string;
  title: string;
  class_name: string | null;
  teaching_date: string | null;
  updated_at: string;
  revision: number;
};

export default async function LessonsPage({ searchParams }: LessonsPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id,title,class_name,teaching_date,updated_at,revision")
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/lessons" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-blue-600 text-white">
              <BookOpen size={20} />
            </span>
            <div>
              <div className="text-lg font-semibold">Lesson Builder</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
          </Link>
          <form action={signOut}>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">New lesson</h1>
          <form action={createLesson} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Title
              <input
                className="h-11 rounded-md border border-slate-300 px-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                name="title"
                placeholder="Year 8 equations"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Class
              <input
                className="h-11 rounded-md border border-slate-300 px-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                name="className"
                placeholder="8A"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Teaching date
              <input
                className="h-11 rounded-md border border-slate-300 px-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                name="teachingDate"
                type="date"
              />
            </label>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
              <Plus size={17} />
              Create lesson
            </button>
          </form>
          {params.message ? (
            <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {params.message}
            </div>
          ) : null}
        </section>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">Lessons</h2>
              <p className="mt-1 text-sm text-slate-600">
                {lessons?.length || 0} saved lesson{lessons?.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {lessons?.length ? (
            <div className="grid gap-3">
              {(lessons as LessonRow[]).map((lesson) => (
                <article
                  key={lesson.id}
                  className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <Link href={`/lessons/${lesson.id}`} className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-slate-950">{lesson.title}</h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
                      <span>{lesson.class_name || "No class"}</span>
                      {lesson.teaching_date ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={15} />
                          {lesson.teaching_date}
                        </span>
                      ) : null}
                      <span>Revision {lesson.revision}</span>
                      <span>Updated {new Date(lesson.updated_at).toLocaleString()}</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <form action={duplicateLesson}>
                      <input type="hidden" name="id" value={lesson.id} />
                      <button
                        className="grid size-10 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
                        title="Duplicate"
                        aria-label="Duplicate lesson"
                      >
                        <Copy size={16} />
                      </button>
                    </form>
                    <form action={archiveLesson}>
                      <input type="hidden" name="id" value={lesson.id} />
                      <button
                        className="grid size-10 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
                        title="Archive"
                        aria-label="Archive lesson"
                      >
                        <Archive size={16} />
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <h3 className="text-lg font-semibold">No lessons yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Create the first online lesson to start syncing slides, assets, and retrieval
                practice to Supabase.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
