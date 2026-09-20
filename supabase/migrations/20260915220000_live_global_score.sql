-- =========================================================
-- Note globale toujours recalculée en direct, jamais figée
-- =========================================================
-- Plutôt que de faire confiance à quiz_attempts.score (qui peut devenir
-- périmé si les questions du QCM changent après coup), cette fonction
-- recalcule la moyenne à la demande, à partir des données actuelles.
-- Accessible à l'arbitre sur sa propre tentative, ou au formateur/admin
-- du QCM — sans restriction de période (c'est juste un nombre, la
-- correction détaillée reste soumise à ses propres règles).

create function public.calculer_score_global(p_attempt_id uuid)
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

  select coalesce(avg(public.calculer_score_question(p_attempt_id, qu.id)), 0)
  into v_score
  from public.questions qu
  where qu.quiz_id = v_quiz_id;

  return v_score;
end;
$$;

grant execute on function public.calculer_score_global(uuid) to authenticated;
