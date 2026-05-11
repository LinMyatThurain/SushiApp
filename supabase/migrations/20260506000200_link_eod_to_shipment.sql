alter table public.end_of_day_submissions
add column if not exists shipment_id uuid;

update public.end_of_day_submissions as eod
set shipment_id = ds.id
from public.daily_shipments as ds
where eod.shipment_id is null
  and eod.store_id = ds.store_id
  and eod.submission_date = ds.shipment_date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'end_of_day_submissions_shipment_id_fkey'
  ) then
    alter table public.end_of_day_submissions
      add constraint end_of_day_submissions_shipment_id_fkey
      foreign key (shipment_id) references public.daily_shipments(id) on delete cascade;
  end if;
end $$;

create unique index if not exists end_of_day_submissions_shipment_id_key
  on public.end_of_day_submissions (shipment_id);
