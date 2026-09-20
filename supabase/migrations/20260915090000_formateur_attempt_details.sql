-- =========================================================
-- Détail des réponses d'un arbitre, consultable par le formateur
-- =========================================================
-- Contrairement à get_exam_results (réservée à l'arbitre sur SA PROPRE
-- tentative, et bloquée avant la fin de période), cette fonction permet
-- au formateur propriétaire du QCM (ou à l'admin) de consulter le détail
-- des réponses de N'IMPORTE QUEL arbitre, à tout moment — y compris
-- pendant que le QCM est encore en cours.

create function public.get_attempt_details_for_formateur(p_attempt_id uuid)
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

grant execute on function public.get_attempt_details_for_formateur(uuid) to authenticated;
