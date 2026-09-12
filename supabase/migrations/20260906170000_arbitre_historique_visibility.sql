-- =========================================================
-- Correction : visibilité des QCM terminés pour l'historique
-- =========================================================
-- La règle précédente ne laissait un arbitre voir un QCM que pendant sa
-- période active. Une fois la période terminée, le QCM devenait
-- invisible — y compris pour l'arbitre qui y avait répondu, empêchant
-- tout historique. On ajoute une règle : un arbitre voit aussi les QCM
-- auxquels il a déjà répondu, indépendamment de la période.
--
-- Fonction de contournement (SECURITY DEFINER) : évite la boucle
-- infinie qui se produirait si la règle de "quizzes" interrogeait
-- directement "quiz_attempts", qui elle-même interroge "quizzes".
create or replace function public.has_submitted_attempt(p_quiz_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.quiz_attempts qa
    where qa.quiz_id = p_quiz_id
      and qa.user_id = auth.uid()
      and qa.status in ('submitted', 'auto_submitted')
  );
$$;

create policy "Un arbitre voit les QCM de son historique"
  on public.quizzes for select
  using (public.has_submitted_attempt(quizzes.id));
