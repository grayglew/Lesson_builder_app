import StudentViewer from "./StudentViewer";

export const metadata = {
  title: "Student Lesson View",
  description: "Open a shared Lesson Builder presentation with a classroom code.",
};

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialCode = Array.isArray(params.code) ? params.code[0] : params.code;
  return <StudentViewer initialCode={initialCode || ""} />;
}
