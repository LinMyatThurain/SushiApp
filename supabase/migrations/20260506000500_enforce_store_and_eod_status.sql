update public.stores
set status = 'active'
where status not in ('active', 'inactive');

update public.end_of_day_submissions
set status = 'submitted'
where status is distinct from 'submitted';

alter table public.stores
  drop constraint if exists stores_status_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_status_check'
  ) then
    alter table public.stores
      add constraint stores_status_check
      check (status in ('active', 'inactive'));
  end if;
end $$;

alter table public.end_of_day_submissions
  drop constraint if exists end_of_day_submissions_status_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'end_of_day_submissions_status_check'
  ) then
    alter table public.end_of_day_submissions
      add constraint end_of_day_submissions_status_check
      check (status in ('submitted'));
  end if;
end $$;
