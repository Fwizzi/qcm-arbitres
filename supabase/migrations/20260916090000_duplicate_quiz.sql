-- =========================================================
-- Duplication complète d'un QCM
-- =========================================================
-- Crée une copie indépendante d'un QCM (toujours en brouillon, quel que
-- soit le statut de l'original — brouillon, publié actif, à venir ou
-- expiré) : mêmes paramètres, mêmes groupes ciblés, toutes les questions
-- et leurs réponses. Le formateur peut ensuite librement modifier la
-- copie (groupes, période, durée...) puisqu'elle reste un brouillon.
--
-- Les vidéos/images ne sont PAS dupliquées ici : cette fonction copie
-- pour l'instant la même référence média que l'original (les fichiers R2
-- eux-mêmes seront dupliqués séparément par une fonction serveur, pour
-- que supprimer l'original ne casse jamais la copie).

create function public.dupliquer_qcm(p_quiz_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nouveau_id uuid;
  v_question record;
  v_nouvelle_question_id uuid;
begin
  if not exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id and (q.formateur_id = auth.uid() or public.has_role('admin'))
  ) then
    raise exception 'Non autorisé.';
  end if;

  insert into public.quizzes (
    formateur_id, title, status, time_limit_minutes,
    show_score, show_correction, show_expected_count, period_start, period_end
  )
  select
    auth.uid(), title || ' (copie)', 'draft', time_limit_minutes,
    show_score, show_correction, show_expected_count, period_start, period_end
  from public.quizzes
  where id = p_quiz_id
  returning id into v_nouveau_id;

  insert into public.quiz_groups (quiz_id, group_id)
  select v_nouveau_id, group_id from public.quiz_groups where quiz_id = p_quiz_id;

  for v_question in select * from public.questions where quiz_id = p_quiz_id order by order_index loop
    insert into public.questions (quiz_id, type, media_url, text, explanation, order_index)
    values (v_nouveau_id, v_question.type, v_question.media_url, v_question.text, v_question.explanation, v_question.order_index)
    returning id into v_nouvelle_question_id;

    insert into public.answer_options (question_id, text, is_correct)
    select v_nouvelle_question_id, text, is_correct
    from public.answer_options where question_id = v_question.id;
  end loop;

  return v_nouveau_id;
end;
$$;

grant execute on function public.dupliquer_qcm(uuid) to authenticated;
