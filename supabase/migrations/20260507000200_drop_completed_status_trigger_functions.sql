do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select
      trigger_name.nspname as trigger_schema,
      trigger_table.relname as trigger_table,
      trigger_row.tgname as trigger_name
    from pg_trigger trigger_row
    join pg_class trigger_table on trigger_table.oid = trigger_row.tgrelid
    join pg_namespace trigger_name on trigger_name.oid = trigger_table.relnamespace
    join pg_proc trigger_function on trigger_function.oid = trigger_row.tgfoid
    where not trigger_row.tgisinternal
      and trigger_name.nspname = 'public'
      and trigger_table.relname in ('daily_shipments', 'end_of_day_submissions', 'end_of_day_items')
      and pg_get_functiondef(trigger_function.oid) ilike '%daily_shipments%'
      and pg_get_functiondef(trigger_function.oid) ilike '%completed%'
  loop
    execute format(
      'drop trigger if exists %I on %I.%I',
      trigger_record.trigger_name,
      trigger_record.trigger_schema,
      trigger_record.trigger_table
    );
  end loop;
end $$;

update public.daily_shipments
set status = 'confirmed'
where status = 'completed';
