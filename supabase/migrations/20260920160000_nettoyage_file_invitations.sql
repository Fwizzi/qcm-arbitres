-- =========================================================
-- Nettoyage de la file d'attente des invitations
-- =========================================================
-- 1) Suppression automatique après 7 jours des lignes TERMINÉES
--    (envoyées ou en échec). Les lignes encore "en_attente" ou "en_cours"
--    ne sont volontairement jamais supprimées automatiquement, même après
--    7 jours : les supprimer reviendrait à annuler silencieusement un
--    envoi qui n'a pas encore eu lieu, sans que personne ne s'en
--    aperçoive. En usage normal, une ligne ne devrait de toute façon
--    jamais rester "en_attente" aussi longtemps (la tâche planifiée en
--    traite une toutes les 30 minutes).
--
-- 2) L'administrateur peut aussi supprimer manuellement une ligne
--    envoyée ou en échec (pas seulement en attente comme jusqu'ici), pour
--    garder la liste lisible sans attendre les 7 jours.

create or replace function public.nettoyer_file_attente_invitations()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.invite_queue
  where status in ('envoye', 'echec')
    and coalesce(sent_at, created_at) < now() - interval '7 days';
$$;

comment on function public.nettoyer_file_attente_invitations() is
  'Supprime les invitations envoyées ou en échec depuis plus de 7 jours. Appelée quotidiennement par pg_cron.';

select cron.schedule(
  'Nettoyage file invitations (7 jours)',
  '0 4 * * *', -- tous les jours à 4h du matin (UTC)
  $$ select public.nettoyer_file_attente_invitations(); $$
);

drop policy if exists "Admin annule une invitation en attente" on public.invite_queue;

create policy "Admin supprime une invitation en attente, envoyée ou en échec"
  on public.invite_queue for delete
  using (public.has_role('admin') and status in ('en_attente', 'envoye', 'echec'));
