do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select
      trigger_name,
      event_object_schema,
      event_object_table
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table in ('daily_shipments', 'end_of_day_submissions', 'end_of_day_items')
      and action_statement ilike '%daily_shipments%'
      and action_statement ilike '%completed%'
  loop
    execute format(
      'drop trigger if exists %I on %I.%I',
      trigger_record.trigger_name,
      trigger_record.event_object_schema,
      trigger_record.event_object_table
    );
  end loop;
end $$;

update public.daily_shipments
set status = 'confirmed'
where status = 'completed';

alter table public.daily_shipments
  drop constraint if exists daily_shipments_status_check;

alter table public.daily_shipments
  add constraint daily_shipments_status_check
  check (status in ('pending', 'confirmed'));
