-- The public bucket for generated pictures and audio. Locally config.toml makes it; a cloud project gets it here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', true, 20971520, array['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav'])
on conflict (id) do nothing;
