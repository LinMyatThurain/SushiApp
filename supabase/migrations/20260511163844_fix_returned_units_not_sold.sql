create or replace function public.recalculate_quantity_sold()
returns trigger
language plpgsql
as $$
declare
  v_quantity_sent integer;
begin
  select si.quantity_sent
  into v_quantity_sent
  from shipment_items si
  join daily_shipments ds on ds.id = si.shipment_id
  join end_of_day_submissions eods
    on eods.store_id = ds.store_id
   and eods.submission_date = ds.shipment_date
  where eods.id = new.submission_id
    and si.product_id = new.product_id
  limit 1;

  v_quantity_sent := coalesce(v_quantity_sent, 0);
  new.quantity_remaining := coalesce(new.quantity_remaining, 0);
  new.quantity_returned := coalesce(new.quantity_returned, 0);

  if new.quantity_remaining + new.quantity_returned > v_quantity_sent then
    raise exception
      'quantity_remaining (%) plus quantity_returned (%) cannot exceed quantity_sent (%) for product %',
      new.quantity_remaining, new.quantity_returned, v_quantity_sent, new.product_id;
  end if;

  new.quantity_sold := v_quantity_sent - new.quantity_remaining - new.quantity_returned;

  return new;
end;
$$;

update end_of_day_items eoi
set quantity_sold = greatest(0, shipped.quantity_sent - coalesce(eoi.quantity_remaining, 0) - coalesce(eoi.quantity_returned, 0))
from (
  select
    eods.id as submission_id,
    si.product_id,
    si.quantity_sent
  from end_of_day_submissions eods
  join daily_shipments ds
    on ds.store_id = eods.store_id
   and ds.shipment_date = eods.submission_date
  join shipment_items si on si.shipment_id = ds.id
) shipped
where shipped.submission_id = eoi.submission_id
  and shipped.product_id = eoi.product_id
  and eoi.quantity_sold <> greatest(0, shipped.quantity_sent - coalesce(eoi.quantity_remaining, 0) - coalesce(eoi.quantity_returned, 0));
