// Le fragment d'URL (#access_token=...&type=...) ramené par un lien Supabase
// (invitation ou réinitialisation) est retiré par le client Supabase peu
// après le chargement de la page. On le lit une seule fois ici, dès
// l'exécution du tout premier module importé par l'application (via la
// chaîne d'imports déclenchée par main.tsx, avant le rendu React), pour
// savoir de façon fiable si le lien qui a amené la personne ici était une
// réinitialisation de mot de passe (type=recovery) ou une première
// activation de compte (type=invite). Utilisé par ActiverCompte.tsx pour
// adapter son texte à la situation.
export const estLienDeReinitialisation = location.hash.includes('type=recovery');
