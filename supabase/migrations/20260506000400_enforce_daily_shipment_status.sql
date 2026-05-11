update public.daily_shipments
set status = 'confirmed'
where status = 'completed';

alter table public.daily_shipments
  drop constraint if exists daily_shipments_status_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_shipments_status_check'
  ) then
    alter table public.daily_shipments
      add constraint daily_shipments_status_check
      check (status in ('pending', 'confirmed'));
  end if;
end $$;
