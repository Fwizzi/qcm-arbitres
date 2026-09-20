-- =========================================================
-- Correction critique : calcul de note non limité au bon QCM
-- =========================================================
-- La migration précédente (optimisation du calcul de note) a introduit
-- une régression : la sous-requête "attendu" (nombre de bonnes réponses
-- par question) ne filtrait pas par QCM — elle parcourait TOUTES les
-- réponses de TOUS les QCM jamais créés dans la base entière, à chaque
-- soumission d'un arbitre. Avec le volume de données de test accumulé,
-- cela pouvait suffire à bloquer la soumission ("Terminer le QCM" reste
-- chargé indéfiniment). La fonction get_exam_results (migration
-- suivante) avait été corrigée correctement ; submit_exam_attempt et
-- calculer_score_global avaient été oubliées.

create or replace function public.submit_exam_attempt(p_attempt_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_id uuid;
  v_time_limit integer;
  v_started_at timestamptz;
  v_new_status public.attempt_status;
  v_score numeric;
begin
  select qa.quiz_id, qa.started_at, q.time_limit_minutes
  into v_quiz_id, v_started_at, v_time_limit
  from public.quiz_attempts qa
  join public.quizzes q on q.id = qa.quiz_id
  where qa.id = p_attempt_id
    and qa.user_id = auth.uid()
    and qa.status = 'in_progress';

  if v_quiz_id is null then
    raise exception 'Tentative introuvable ou déjà soumise.';
  end if;

  v_new_status := case
    when now() > v_started_at + (v_time_limit || ' minutes')::interval then 'auto_submitted'
    else 'submitted'
  end;

  with attendu as (
    select ao.question_id, count(*) as nb_attendu
    from public.answer_options ao
    join public.questions qu on qu.id = ao.question_id
    where qu.quiz_id = v_quiz_id and ao.is_correct
    group by ao.question_id
  ),
  coche as (
    select question_id, count(*) as nb_coche
    from public.selected_answers
    where attempt_id = p_attempt_id
    group by question_id
  ),
  coche_correct as (
    select sa.question_id, count(*) as nb_coche_correct
    from public.selected_answers sa
    join public.answer_options ao on ao.id = sa.option_id
    where sa.attempt_id = p_attempt_id and ao.is_correct
    group by sa.question_id
  )
  select coalesce(avg(
    case
      when coalesce(a.nb_attendu, 0) = 0 then 0
      when coalesce(c.nb_coche, 0) > a.nb_attendu then 0
      else round((coalesce(cc.nb_coche_correct, 0)::numeric / a.nb_attendu::numeric) * 100, 2)
    end
  ), 0)
  into v_score
  from public.questions q
  left join attendu a on a.question_id = q.id
  left join coche c on c.question_id = q.id
  left join coche_correct cc on cc.question_id = q.id
  where q.quiz_id = v_quiz_id;

  update public.quiz_attempts
  set status = v_new_status, submitted_at = now(), score = v_score
  where id = p_attempt_id;

  return v_score;
end;
$$;

grant execute on function public.submit_exam_attempt(uuid) to authenticated;

create or replace function public.calculer_score_global(p_attempt_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_quiz_id uuid;
  v_score numeric;
begin
  select qa.quiz_id into v_quiz_id
  from public.quiz_attempts qa
  join public.quizzes q on q.id = qa.quiz_id
  where qa.id = p_attempt_id
    and (qa.user_id = auth.uid() or q.formateur_id = auth.uid() or public.has_role('admin'));

  if v_quiz_id is null then
    raise exception 'Non autorisé.';
  end if;

  with attendu as (
    select ao.question_id, count(*) as nb_attendu
    from public.answer_options ao
    join public.questions qu on qu.id = ao.question_id
    where qu.quiz_id = v_quiz_id and ao.is_correct
    group by ao.question_id
  ),
  coche as (
    select question_id, count(*) as nb_coche
    from public.selected_answers
    where attempt_id = p_attempt_id
    group by question_id
  ),
  coche_correct as (
    select sa.question_id, count(*) as nb_coche_correct
    from public.selected_answers sa
    join public.answer_options ao on ao.id = sa.option_id
    where sa.attempt_id = p_attempt_id and ao.is_correct
    group by sa.question_id
  )
  select coalesce(avg(
    case
      when coalesce(a.nb_attendu, 0) = 0 then 0
      when coalesce(c.nb_coche, 0) > a.nb_attendu then 0
      else round((coalesce(cc.nb_coche_correct, 0)::numeric / a.nb_attendu::numeric) * 100, 2)
    end
  ), 0)
  into v_score
  from public.questions q
  left join attendu a on a.question_id = q.id
  left join coche c on c.question_id = q.id
  left join coche_correct cc on cc.question_id = q.id
  where q.quiz_id = v_quiz_id;

  return v_score;
end;
$$;

grant execute on function public.calculer_score_global(uuid) to authenticated;
