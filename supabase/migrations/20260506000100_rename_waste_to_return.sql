alter table if exists public.end_of_day_items
  rename column quantity_wasted to quantity_returned;

alter table if exists public.end_of_day_items
  rename column waste_reason to return_reason;

drop view if exists public.v_daily_sales cascade;

create view public.v_daily_sales as
select
  eoi.id as submission_id,
  eos.submission_date,
  eos.status as submission_status,
  eos.store_id,
  st.name as store_name,
  st.location as store_location,
  eoi.product_id,
  p.product_name,
  p.sku,
  p.category,
  p.price,
  coalesce((
    select sum(si.quantity_sent)
    from public.daily_shipments ds
    join public.shipment_items si on si.shipment_id = ds.id
    where ds.store_id = eos.store_id
      and ds.shipment_date = eos.submission_date
      and si.product_id = eoi.product_id
  ), 0)::integer as quantity_sent,
  coalesce(eoi.quantity_sold, 0) as quantity_sold,
  coalesce(eoi.quantity_remaining, 0) as quantity_remaining,
  coalesce(eoi.quantity_returned, 0) as quantity_returned,
  coalesce(eoi.return_reason, '')::text as return_reason,
  coalesce(eoi.quantity_sold, 0) * coalesce(p.price, 0) as revenue
from public.end_of_day_items eoi
join public.end_of_day_submissions eos on eos.id = eoi.submission_id
join public.stores st on st.id = eos.store_id
join public.sushi_products p on p.id = eoi.product_id;
