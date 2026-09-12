-- =========================================================
-- La période d'accessibilité inclut désormais l'heure
-- =========================================================
-- Jusqu'ici, period_start/period_end étaient de simples dates (le jour,
-- sans heure précise). Le formateur doit pouvoir choisir une heure de
-- déverrouillage/fermeture précise, pas seulement un jour.

-- La vue ET plusieurs règles de sécurité dépendent de ces colonnes : il
-- faut toutes les retirer avant de changer le type, puis les recréer
-- ensuite avec la logique mise à jour (now() au lieu de current_date).
drop view public.quizzes_with_computed_status;
drop policy "Un arbitre voit les QCM publiés et actifs de ses groupes" on public.quizzes;
drop policy "Voir les questions d'un QCM qu'on peut voir" on public.questions;
drop policy "Voir les réponses d'une question visible" on public.answer_options;

alter table public.quizzes
  alter column period_start type timestamptz using period_start::timestamptz,
  alter column period_end type timestamptz using period_end::timestamptz;

-- La vue de statut doit comparer l'instant précis (now()), plus seulement
-- le jour (current_date), pour respecter l'heure choisie.
create view public.quizzes_with_computed_status
with (security_invoker = true)
as
select
  q.*,
  case
    when q.status = 'draft' then 'draft'
    when now() < q.period_start then 'a_venir'
    when now() > q.period_end then 'expire'
    else 'actif'
  end as computed_status
from public.quizzes q;

create policy "Un arbitre voit les QCM publiés et actifs de ses groupes"
  on public.quizzes for select
  using (
    status = 'published'
    and now() between period_start and period_end
    and exists (
      select 1 from public.quiz_groups qg
      join public.group_members gm on gm.group_id = qg.group_id
      where qg.quiz_id = quizzes.id and gm.user_id = auth.uid()
    )
  );

create policy "Voir les questions d'un QCM qu'on peut voir"
  on public.questions for select
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = questions.quiz_id
      and (
        q.formateur_id = auth.uid()
        or public.has_role('admin')
        or (
          q.status = 'published'
          and now() between q.period_start and q.period_end
          and exists (
            select 1 from public.quiz_groups qg
            join public.group_members gm on gm.group_id = qg.group_id
            where qg.quiz_id = q.id and gm.user_id = auth.uid()
          )
        )
      )
    )
  );

create policy "Voir les réponses d'une question visible"
  on public.answer_options for select
  using (
    exists (
      select 1 from public.questions qu
      join public.quizzes q on q.id = qu.quiz_id
      where qu.id = answer_options.question_id
      and (
        q.formateur_id = auth.uid()
        or public.has_role('admin')
        or (
          q.status = 'published'
          and now() between q.period_start and q.period_end
          and exists (
            select 1 from public.quiz_groups qg
            join public.group_members gm on gm.group_id = qg.group_id
            where qg.quiz_id = q.id and gm.user_id = auth.uid()
          )
        )
      )
    )
  );

-- Idem pour la fonction qui sert les questions à l'arbitre pendant l'examen.
create or replace function public.get_exam_questions(p_quiz_id uuid)
returns table (
  id uuid,
  type public.question_type,
  media_url text,
  text text,
  order_index integer,
  max_selectable integer,
  options jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.quizzes q
    join public.quiz_groups qg on qg.quiz_id = q.id
    join public.group_members gm on gm.group_id = qg.group_id
    where q.id = p_quiz_id
      and q.status = 'published'
      and now() between q.period_start and q.period_end
      and gm.user_id = auth.uid()
  ) then
    raise exception 'Non autorisé.';
  end if;

  if exists (
    select 1 from public.quiz_attempts qa
    where qa.quiz_id = p_quiz_id and qa.user_id = auth.uid()
      and qa.status in ('submitted', 'auto_submitted')
  ) then
    raise exception 'Ce QCM a déjà été soumis.';
  end if;

  return query
  select
    qu.id, qu.type, qu.media_url, qu.text, qu.order_index,
    (select count(*)::integer from public.answer_options ao where ao.question_id = qu.id and ao.is_correct) as max_selectable,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', ao.id, 'text', ao.text) order by ao.id)
       from public.answer_options ao where ao.question_id = qu.id),
      '[]'::jsonb
    ) as options
  from public.questions qu
  where qu.quiz_id = p_quiz_id
  order by qu.order_index;
end;
$$;
