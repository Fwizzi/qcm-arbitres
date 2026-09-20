-- =========================================================
-- Correction : un formateur doit pouvoir s'auto-cibler pour tester
-- =========================================================
-- Le correctif précédent excluait systématiquement les QCM créés par
-- la personne elle-même de sa propre vue arbitre, pour éviter qu'un
-- compte double-rôle voie ses QCM sans être dans le groupe ciblé. Mais
-- cela empêchait aussi le cas légitime : un formateur qui s'ajoute
-- volontairement à un groupe ciblé pour tester son propre QCM.
--
-- Cette fonction remplace le filtre "pas mes propres QCM" par une
-- vérification précise et suffisante : l'appartenance RÉELLE à un
-- groupe ciblé par le QCM, peu importe qui l'a créé.

create function public.get_arbitre_quizzes()
returns table (
  id uuid,
  title text,
  time_limit_minutes integer
)
language sql
security definer
set search_path = public
stable
as $$
  select q.id, q.title, q.time_limit_minutes
  from public.quizzes q
  where q.status = 'published'
    and now() between q.period_start and q.period_end
    and exists (
      select 1
      from public.quiz_groups qg
      join public.group_members gm on gm.group_id = qg.group_id
      where qg.quiz_id = q.id and gm.user_id = auth.uid()
    );
$$;

grant execute on function public.get_arbitre_quizzes() to authenticated;
