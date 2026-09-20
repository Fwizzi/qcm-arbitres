-- =========================================================
-- Accès admin garanti pour consulter les résultats de tout QCM
-- =========================================================
-- L'administrateur doit pouvoir consulter les résultats (et exporter)
-- de n'importe quel QCM, comme le ferait le formateur qui l'a créé.
-- Les fonctions calculer_score_global et get_attempt_details_for_formateur
-- autorisent déjà l'admin. Ces politiques ajoutent, par prudence, une
-- garantie explicite sur les tables lues directement par l'écran de
-- résultats (quiz_attempts, quiz_groups, group_members) : elles
-- s'ajoutent aux règles déjà en place (plusieurs règles permissives se
-- combinent avec OU), sans rien retirer à personne.

create policy "Admin voit toutes les tentatives"
  on public.quiz_attempts for select
  using (public.has_role('admin'));

create policy "Admin voit tous les groupes ciblés par un QCM"
  on public.quiz_groups for select
  using (public.has_role('admin'));

create policy "Admin voit tous les membres de groupe"
  on public.group_members for select
  using (public.has_role('admin'));
