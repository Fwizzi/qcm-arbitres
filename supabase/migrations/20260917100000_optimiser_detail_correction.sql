-- =========================================================
-- Accélération du détail des réponses (le vrai goulot d'étranglement)
-- =========================================================
-- get_exam_results() et get_attempt_details_for_formateur() affichent
-- une ligne par RÉPONSE POSSIBLE (pas par question), et recalculaient
-- la note de la question à CHAQUE ligne — donc plusieurs fois pour la
-- même question (une fois par réponse possible qu'elle propose). Pour
-- un QCM à 11 questions × 4 réponses, cela représentait environ 130
-- petites requêtes internes, bien plus que le calcul de la note globale
-- déjà optimisé précédemment. Cette fonction s'exécute automatiquement
-- dès l'arrivée sur l'écran de résultat (si la correction est activée),
-- ce qui explique la lenteur au clic sur "Terminer".
--
-- Cette migration calcule la note de chaque question UNE SEULE FOIS
-- (regroupée), puis l'associe à ses réponses pour l'affichage — au lieu
-- de la recalculer à chaque réponse.

create or replace function public.get_exam_results(p_attempt_id uuid)
returns table (
  question_id uuid,
  question_type public.question_type,
  media_url text,
  question_text text,
  explanation text,
  question_score numeric,
  option_id uuid,
  option_text text,
  is_correct boolean,
  was_selected boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_id uuid;
  v_show_correction boolean;
  v_period_end timestamptz;
  v_retention_days integer;
begin
  select qa.quiz_id into v_quiz_id
  from public.quiz_attempts qa
  where qa.id = p_attempt_id
    and qa.user_id = auth.uid()
    and qa.status in ('submitted', 'auto_submitted');

  if v_quiz_id is null then
    raise exception 'Non autorisé.';
  end if;

  select q.show_correction, q.period_end into v_show_correction, v_period_end
  from public.quizzes q where q.id = v_quiz_id;

  if not v_show_correction then
    raise exception 'La correction n''est pas activée pour ce QCM.';
  end if;

  if now() <= v_period_end then
    raise exception 'La correction détaillée sera consultable après la fin de la période du QCM.';
  end if;

  select coalesce((select value from public.app_settings where key = 'arbitre_retention_days')::integer, 30)
  into v_retention_days;

  if now() > v_period_end + (v_retention_days || ' days')::interval then
    raise exception 'Le délai de consultation de la correction est dépassé.';
  end if;

  return query
  with attendu as (
    select ao.question_id, count(*) as nb_attendu
    from public.answer_options ao
    join public.questions qu on qu.id = ao.question_id
    where qu.quiz_id = v_quiz_id and ao.is_correct
    group by ao.question_id
  ),
  coche as (
    select sa.question_id, count(*) as nb_coche
    from public.selected_answers sa
    where sa.attempt_id = p_attempt_id
    group by sa.question_id
  ),
  coche_correct as (
    select sa.question_id, count(*) as nb_coche_correct
    from public.selected_answers sa
    join public.answer_options ao on ao.id = sa.option_id
    where sa.attempt_id = p_attempt_id and ao.is_correct
    group by sa.question_id
  ),
  scores as (
    select qu.id as question_id,
      case
        when coalesce(a.nb_attendu, 0) = 0 then 0
        when coalesce(c.nb_coche, 0) > a.nb_attendu then 0
        else round((coalesce(cc.nb_coche_correct, 0)::numeric / a.nb_attendu::numeric) * 100, 2)
      end as score
    from public.questions qu
    left join attendu a on a.question_id = qu.id
    left join coche c on c.question_id = qu.id
    left join coche_correct cc on cc.question_id = qu.id
    where qu.quiz_id = v_quiz_id
  )
  select
    qu.id, qu.type, qu.media_url, qu.text, qu.explanation, s.score,
    ao.id, ao.text, ao.is_correct,
    exists(select 1 from public.selected_answers sa where sa.attempt_id = p_attempt_id and sa.option_id = ao.id)
  from public.questions qu
  join public.answer_options ao on ao.question_id = qu.id
  join scores s on s.question_id = qu.id
  where qu.quiz_id = v_quiz_id
  order by qu.order_index, ao.id;
end;
$$;

grant execute on function public.get_exam_results(uuid) to authenticated;

-- Même correction pour l'écran de détail formateur.
create or replace function public.get_attempt_details_for_formateur(p_attempt_id uuid)
returns table (
  question_id uuid,
  question_type public.question_type,
  media_url text,
  question_text text,
  explanation text,
  question_score numeric,
  option_id uuid,
  option_text text,
  is_correct boolean,
  was_selected boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_id uuid;
begin
  select qa.quiz_id into v_quiz_id
  from public.quiz_attempts qa
  join public.quizzes q on q.id = qa.quiz_id
  where qa.id = p_attempt_id
    and (q.formateur_id = auth.uid() or public.has_role('admin'));

  if v_quiz_id is null then
    raise exception 'Non autorisé.';
  end if;

  return query
  with attendu as (
    select ao.question_id, count(*) as nb_attendu
    from public.answer_options ao
    join public.questions qu on qu.id = ao.question_id
    where qu.quiz_id = v_quiz_id and ao.is_correct
    group by ao.question_id
  ),
  coche as (
    select sa.question_id, count(*) as nb_coche
    from public.selected_answers sa
    where sa.attempt_id = p_attempt_id
    group by sa.question_id
  ),
  coche_correct as (
    select sa.question_id, count(*) as nb_coche_correct
    from public.selected_answers sa
    join public.answer_options ao on ao.id = sa.option_id
    where sa.attempt_id = p_attempt_id and ao.is_correct
    group by sa.question_id
  ),
  scores as (
    select qu.id as question_id,
      case
        when coalesce(a.nb_attendu, 0) = 0 then 0
        when coalesce(c.nb_coche, 0) > a.nb_attendu then 0
        else round((coalesce(cc.nb_coche_correct, 0)::numeric / a.nb_attendu::numeric) * 100, 2)
      end as score
    from public.questions qu
    left join attendu a on a.question_id = qu.id
    left join coche c on c.question_id = qu.id
    left join coche_correct cc on cc.question_id = qu.id
    where qu.quiz_id = v_quiz_id
  )
  select
    qu.id, qu.type, qu.media_url, qu.text, qu.explanation, s.score,
    ao.id, ao.text, ao.is_correct,
    exists(select 1 from public.selected_answers sa where sa.attempt_id = p_attempt_id and sa.option_id = ao.id)
  from public.questions qu
  join public.answer_options ao on ao.question_id = qu.id
  join scores s on s.question_id = qu.id
  where qu.quiz_id = v_quiz_id
  order by qu.order_index, ao.id;
end;
$$;

grant execute on function public.get_attempt_details_for_formateur(uuid) to authenticated;
