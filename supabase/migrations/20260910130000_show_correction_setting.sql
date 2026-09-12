-- =========================================================
-- Réglage indépendant : afficher la correction à l'issue de la période
-- =========================================================
-- Jusqu'ici, la correction détaillée était conditionnée par
-- "show_score". Le formateur doit pouvoir décider séparément : afficher
-- la note (show_score) ET/OU afficher la correction détaillée
-- (show_correction) une fois la période terminée.

alter table public.quizzes
  add column show_correction boolean not null default true;

comment on column public.quizzes.show_correction is 'Si vrai, l''arbitre peut consulter la correction détaillée (bonnes réponses, vidéos) une fois la période du QCM terminée, dans la limite de la durée de rétention. Indépendant de show_score.';

drop function public.get_exam_results(uuid);

create function public.get_exam_results(p_attempt_id uuid)
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
  select
    qu.id, qu.type, qu.media_url, qu.text, qu.explanation,
    public.calculer_score_question(p_attempt_id, qu.id),
    ao.id, ao.text, ao.is_correct,
    exists(select 1 from public.selected_answers sa where sa.attempt_id = p_attempt_id and sa.option_id = ao.id)
  from public.questions qu
  join public.answer_options ao on ao.question_id = qu.id
  where qu.quiz_id = v_quiz_id
  order by qu.order_index, ao.id;
end;
$$;

grant execute on function public.get_exam_results(uuid) to authenticated;
