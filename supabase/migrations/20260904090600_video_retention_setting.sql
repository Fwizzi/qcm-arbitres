-- =========================================================
-- Ajout : durée de conservation des vidéos des QCM expirés
-- =========================================================
-- Valeur par défaut de 90 jours, modifiable par l'administrateur
-- depuis l'écran de réglages (à réduire si l'espace Cloudflare R2
-- vient à manquer). La suppression effective de la vidéo au bout
-- de ce délai sera assurée par une tâche applicative (hors SQL),
-- développée lors de la phase de code.

insert into public.app_settings (key, value)
values ('video_retention_days', '90')
on conflict (key) do nothing;
