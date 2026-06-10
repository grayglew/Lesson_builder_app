# Lesson Builder Online

Next.js + Supabase version of the Lesson Builder app. It uses the existing Supabase project:

- Production URL: `https://lesson-builder-online.vercel.app`
- Project ref: `fjrukfawhmbdmrztznlf`
- Supabase URL: `https://fjrukfawhmbdmrztznlf.supabase.co`
- Private storage bucket: `lesson-assets`

## What Is Implemented

- Supabase Auth sign-up, sign-in, sign-out, and email confirmation route.
- Protected lesson dashboard.
- Lesson editor with slide types, metadata, autosave, manual save, and version snapshots.
- Retrieval practice bank with due-item scoring, pasted LO import, taught logging, and image attachments.
- Private asset uploads through Supabase Storage.
- Exports for standalone HTML, full JSON backup, and browser print-to-PDF.
- Supabase RLS schema and storage policies in `supabase/migrations`.

## Local Setup

Install dependencies:

```powershell
npm.cmd install
```

Create `.env.local`:

```powershell
NEXT_PUBLIC_SUPABASE_URL=https://fjrukfawhmbdmrztznlf.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Run the dev server:

```powershell
npm.cmd run dev -- --port 3000
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```powershell
npm.cmd run lint
npm.cmd run build
```

## Vercel Environment Variables

Set these in the Vercel project for Production, Preview, and Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No service role key is required by the app.

Production and Development are configured on the linked Vercel project. Add the same two variables to Preview after the app is attached to a Git branch/repository.
