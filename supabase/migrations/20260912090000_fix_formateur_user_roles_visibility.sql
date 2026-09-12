-- =========================================================
-- Correction de sécurité : visibilité des rôles pour les formateurs
-- =========================================================
-- Même faille que celle déjà corrigée sur "profiles" : un formateur ne
-- voyait que SES PROPRES lignes dans user_roles, ce qui l'empêchait de
-- retrouver quels comptes sont arbitres pour composer un groupe — y
-- compris les comptes qui cumulent plusieurs rôles (formateur+arbitre,
-- admin+formateur+arbitre).

create policy "Un formateur voit tous les rôles (gestion des groupes et QCM)"
  on public.user_roles for select
  using (public.has_role('formateur'));
