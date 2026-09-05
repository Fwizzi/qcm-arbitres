-- Extension nécessaire pour générer des identifiants uuid aléatoires.
-- Sur Supabase, elle est déjà activée par défaut : ce fichier s'assure
-- juste qu'elle l'est, sans provoquer d'erreur si c'est déjà le cas.
create extension if not exists pgcrypto;
