create sequence if not exists public.daily_shipments_code_seq;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_shipments'
      and column_name = 'shipment_code'
  ) then
    alter table public.daily_shipments
      add column shipment_code text;
  end if;
end $$;

with numbered as (
  select
    id,
    'S-' || lpad(row_number() over (order by created_at, id)::text, 5, '0') as shipment_code
  from public.daily_shipments
)
update public.daily_shipments as ds
set shipment_code = numbered.shipment_code
from numbered
where ds.id = numbered.id
  and ds.shipment_code is null;

do $$
begin
  if exists (
    select 1
    from public.daily_shipments
    where shipment_code is null
  ) then
    raise exception 'Failed to backfill shipment codes.';
  end if;
end $$;

select setval(
  'public.daily_shipments_code_seq',
  coalesce(
    (
      select max((regexp_replace(shipment_code, '[^0-9]', '', 'g'))::bigint)
      from public.daily_shipments
    ),
    0
  ),
  true
);

alter table public.daily_shipments
  alter column shipment_code set default ('S-' || lpad(nextval('public.daily_shipments_code_seq')::text, 5, '0'));

alter table public.daily_shipments
  alter column shipment_code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_shipments_shipment_code_key'
  ) then
    alter table public.daily_shipments
      add constraint daily_shipments_shipment_code_key unique (shipment_code);
  end if;
end $$;
