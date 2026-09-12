-- =========================================================
-- Soumission d'un QCM et calcul du score (côté serveur uniquement)
-- =========================================================
-- Le score ne doit JAMAIS être calculé côté navigateur : ça obligerait
-- à y envoyer les bonnes réponses, ce qu'on a justement pris soin
-- d'éviter. Cette fonction fait tout le travail sur le serveur.
-- Une question compte comme "correcte" si l'arbitre a coché exactement
-- les bonnes réponses (ni plus, ni moins).

create function public.submit_exam_attempt(p_attempt_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_id uuid;
  v_time_limit integer;
  v_started_at timestamptz;
  v_score integer;
  v_new_status public.attempt_status;
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

  select count(*) into v_score
  from public.questions qu
  where qu.quiz_id = v_quiz_id
    -- aucune bonne réponse oubliée
    and not exists (
      select 1 from public.answer_options ao
      where ao.question_id = qu.id and ao.is_correct
        and not exists (
          select 1 from public.selected_answers sa
          where sa.attempt_id = p_attempt_id and sa.option_id = ao.id
        )
    )
    -- aucune mauvaise réponse cochée
    and not exists (
      select 1 from public.selected_answers sa
      join public.answer_options ao on ao.id = sa.option_id
      where sa.attempt_id = p_attempt_id and ao.question_id = qu.id and not ao.is_correct
    );

  update public.quiz_attempts
  set status = v_new_status, submitted_at = now(), score = v_score
  where id = p_attempt_id;

  return v_score;
end;
$$;

grant execute on function public.submit_exam_attempt(uuid) to authenticated;
