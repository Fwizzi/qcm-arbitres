-- =========================================================
-- Suppression d'un groupe : interdite s'il sert à un QCM publié
-- =========================================================
-- Un formateur peut supprimer un groupe qu'il a créé, mais seulement
-- s'il n'est ciblé par aucun QCM publié (quel que soit son statut actif/
-- expiré — "publié" au sens où il n'est plus un brouillon). Ça évite de
-- casser l'historique et les statistiques d'un QCM déjà diffusé.
-- L'administrateur garde la possibilité de tout supprimer si besoin.

create or replace function public.empecher_suppression_groupe_utilise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_role('admin') then
    return old;
  end if;

  if exists (
    select 1
    from public.quiz_groups qg
    join public.quizzes q on q.id = qg.quiz_id
    where qg.group_id = OLD.id and q.status = 'published'
  ) then
    raise exception 'Ce groupe est utilisé par un QCM publié et ne peut pas être supprimé.';
  end if;

  return old;
end;
$$;

create trigger trg_empecher_suppression_groupe_utilise
before delete on public.groups
for each row execute function public.empecher_suppression_groupe_utilise();

-- Correction d'un oubli plus ancien, révélé par les tests ci-dessus :
-- la règle de suppression ne permettait jamais à l'administrateur de
-- supprimer un groupe, même en dehors de tout QCM publié. Idem pour la
-- modification, par cohérence.
alter policy "Un formateur supprime ses propres groupes"
  on public.groups
  using (formateur_id = auth.uid() or public.has_role('admin'));

alter policy "Un formateur modifie ses propres groupes"
  on public.groups
  using (formateur_id = auth.uid() or public.has_role('admin'));
