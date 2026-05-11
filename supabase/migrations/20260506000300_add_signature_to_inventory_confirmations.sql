alter table public.inventory_confirmations
add column if not exists signer_name text,
add column if not exists signature_data text;
