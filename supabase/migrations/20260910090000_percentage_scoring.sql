-- =========================================================
-- Notation en pourcentage, avec crédit partiel par question
-- =========================================================
-- Nouvelle logique de notation, remplace le simple comptage de questions
-- entièrement correctes :
--   - Si le nombre de cases cochées dépasse le nombre de bonnes réponses
--     attendues : 0 % pour la question.
--   - Sinon : (nombre de bonnes réponses cochées / nombre de bonnes
--     réponses attendues) × 100.
-- Cette même formule couvre tous les cas décrits par l'administrateur,
-- y compris le mélange bonnes/mauvaises réponses en cochant exactement
-- le bon nombre de cases.
-- La note globale du QCM est la moyenne des notes de chaque question.

alter table public.quizzes
  add column show_expected_count boolean not null default true;

comment on column public.quizzes.show_expected_count is 'Si vrai, l''arbitre voit "Choisis jusqu''à N réponses" et ne peut pas cocher plus que N. Si faux, aucune limite affichée ni imposée à la sélection (mais la notation reste la même).';

-- Fonction partagée : calcule la note d'UNE question pour UNE tentative,
-- utilisée à la fois par la soumission et par l'écran de résultat, pour
-- ne jamais avoir deux formules différentes qui pourraient diverger.
create or replace function public.calculer_score_question(p_attempt_id uuid, p_question_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_attendu integer;
  v_correct_coche integer;
  v_total_coche integer;
begin
  select count(*) into v_attendu
  from public.answer_options
  where question_id = p_question_id and is_correct;

  select count(*) into v_total_coche
  from public.selected_answers
  where attempt_id = p_attempt_id and question_id = p_question_id;

  select count(*) into v_correct_coche
  from public.selected_answers sa
  join public.answer_options ao on ao.id = sa.option_id
  where sa.attempt_id = p_attempt_id and sa.question_id = p_question_id and ao.is_correct;

  if v_attendu = 0 then
    return 0;
  end if;

  if v_total_coche > v_attendu then
    return 0;
  end if;

  return round((v_correct_coche::numeric / v_attendu::numeric) * 100, 2);
end;
$$;

grant execute on function public.calculer_score_question(uuid, uuid) to authenticated;

-- La note globale devient un pourcentage (avec décimales), plus un
-- simple compte de questions entières.
alter table public.quiz_attempts
  alter column score type numeric(5, 2) using score::numeric;

drop function public.submit_exam_attempt(uuid);

create function public.submit_exam_attempt(p_attempt_id uuid)
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

  select coalesce(avg(public.calculer_score_question(p_attempt_id, qu.id)), 0)
  into v_score
  from public.questions qu
  where qu.quiz_id = v_quiz_id;

  update public.quiz_attempts
  set status = v_new_status, submitted_at = now(), score = v_score
  where id = p_attempt_id;

  return v_score;
end;
$$;

grant execute on function public.submit_exam_attempt(uuid) to authenticated;

-- get_exam_results renvoie maintenant aussi la note de chaque question
-- (même valeur répétée sur chaque ligne de réponse de cette question),
-- pour que l'écran de résultat n'ait pas à refaire le calcul lui-même.
drop function public.get_exam_results(uuid);

create function public.get_exam_results(p_attempt_id uuid)
returns table (
  question_id uuid,
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
  v_show_score boolean;
begin
  select qa.quiz_id into v_quiz_id
  from public.quiz_attempts qa
  where qa.id = p_attempt_id
    and qa.user_id = auth.uid()
    and qa.status in ('submitted', 'auto_submitted');

  if v_quiz_id is null then
    raise exception 'Non autorisé.';
  end if;

  select q.show_score into v_show_score from public.quizzes q where q.id = v_quiz_id;
  if not v_show_score then
    raise exception 'Le score n''est pas affiché pour ce QCM.';
  end if;

  return query
  select
    qu.id, qu.text, qu.explanation,
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
