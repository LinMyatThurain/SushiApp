# GitHub Copilot Instructions

This repository uses Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn UI primitives, and Supabase.

## Key guidance

- Use the App Router (`app/`) only. Do not create legacy `pages/` router pages, `getServerSideProps`, or `getStaticProps`.
- Prefer server components for `app` routes. Add `'use client'` only when browser APIs or client state are required.
- Keep UI primitives in `components/ui/*` and shared logic in `lib/*`.
- Use `@/` imports for workspace modules.
- Keep Supabase service credentials server-side and use `NEXT_PUBLIC_SUPABASE_URL` only for public client-side values.
- API endpoints belong under `app/api/**/route.ts`.
- Database schema/types are in `lib/types/database.types.ts`.
- Supabase migrations are in `supabase/migrations`.

## Build commands

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Recommended custom agents

- **Repo Expert**: general repo tasks, Next.js App Router, React 19, Tailwind v4, shadcn, Supabase patterns.
- **Admin / Dashboard Helper**: admin pages under `app/admin/**`, tables, dashboard UI, navigation.
- **Supabase API Helper**: server-side endpoints in `app/api/**/route.ts`, Supabase auth/role logic.
- **UI Component Builder**: components in `components/ui/*`, consistent styling and reuse.
- **Migration & Data Model Assistant**: `supabase/migrations`, schema changes, `lib/types/database.types.ts`.
- **Route / Navigation Maintainer**: App Router structure, route additions, and refactors.
