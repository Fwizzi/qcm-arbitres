-- =========================================================
-- Correction de sécurité : la vue quizzes_with_computed_status
-- =========================================================
-- Par défaut, une vue PostgreSQL s'exécute avec les droits de son
-- créateur (ici, un compte administrateur technique), et NON avec ceux
-- de la personne qui l'interroge : elle ignorait donc totalement les
-- règles RLS de la table "quizzes", et montrait les QCM de tous les
-- formateurs à n'importe qui. "security_invoker = true" force la vue à
-- respecter les droits de la personne réellement connectée.

alter view public.quizzes_with_computed_status set (security_invoker = true);
