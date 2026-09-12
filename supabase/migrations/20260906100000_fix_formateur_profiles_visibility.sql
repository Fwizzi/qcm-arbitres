-- =========================================================
-- Correction de sécurité : visibilité des profils pour les formateurs
-- =========================================================
-- La règle initiale ne laissait chacun voir que son propre profil (sauf
-- l'admin, qui voit tout). Cela empêchait un formateur de voir le nom des
-- arbitres (pour composer un groupe) et des autres formateurs (pour
-- partager un groupe) — fonctionnalités pourtant nécessaires et prévues.
-- Un formateur peut désormais voir tous les profils (55 personnes au
-- total, toutes de la même fédération) ; les arbitres, eux, continuent de
-- ne voir que le leur.

create policy "Un formateur voit tous les profils (gestion groupes et QCM)"
  on public.profiles for select
  using (public.has_role('formateur'));
