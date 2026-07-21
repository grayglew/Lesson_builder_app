-- Staging and local environments intentionally start without production user data.
-- Synthetic lesson documents used by automated tests live under tests/fixtures.
-- Create staging Auth users through the admin API, then use the application APIs
-- so RLS and Storage ownership are exercised exactly as they are in production.
select 1;
