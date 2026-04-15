---
title: Create Missing Profiles Table and Auth Trigger
status: todo
priority: urgent
type: bug
tags: [auth, database, blocker]
created_by: softgen
created_at: 2026-04-15T01:15:00Z
position: 2
---

## Notes
The application's authentication flow is broken because:
1. `AuthContext.tsx` fetches user profiles from a `profiles` table that doesn't exist in the database
2. There's no trigger to auto-create profile rows when users sign up via `supabase.auth.signUp()`
3. Users can complete signup but won't be able to log in because profile fetching fails

This blocks all authentication features.

## Checklist
- [ ] Create `profiles` table with columns: `id` (UUID, FK to auth.users), `email`, `name`, `role`, `company_id`, `branch_id`, `avatar_url`, `access_scope`, timestamps
- [ ] Create trigger function `handle_new_user()` to auto-insert profile row on user signup
- [ ] Add RLS policies for profiles (T1 pattern - users can read/update their own profile)
- [ ] Backfill existing auth.users into profiles table
- [ ] Test signup flow end-to-end