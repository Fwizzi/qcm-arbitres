// Fonction Supabase Edge Function : gestion des comptes, réservée à
// l'administrateur. La clé secrète (SERVICE_ROLE) reste ici, côté
// serveur, et n'est jamais envoyée au navigateur.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Adresse de l'application, utilisée pour construire le lien d'activation
// envoyé (ou généré) lors d'une invitation. Peut être surchargée par la
// variable d'environnement SITE_URL si le nom de domaine change un jour.
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://fwizzi.github.io/qcm-arbitres';

const ROLES_VALIDES = ['admin', 'formateur', 'arbitre'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function rolesValides(roles: unknown): roles is string[] {
  return (
    Array.isArray(roles) &&
    roles.length > 0 &&
    roles.every((r) => typeof r === 'string' && ROLES_VALIDES.includes(r))
  );
}

// Envoie immédiatement une invitation qui vient d'être insérée dans
// invite_queue (utilisé quand la file était vide : pas de raison de faire
// attendre jusqu'à 30 minutes le tout premier envoi). Reprend exactement
// la même logique que send-queued-invites (réservation puis envoi), pour
// qu'une ligne traitée ici finisse dans le même état qu'une ligne traitée
// plus tard par la tâche planifiée.
async function envoyerInvitationMaintenant(
  supabaseAdmin: ReturnType<typeof createClient>,
  ligne: { id: string; full_name: string; email: string; roles: string[] }
): Promise<{ ok: boolean; erreur: string | null; transitoire: boolean }> {
  const { data: claimed } = await supabaseAdmin
    .from('invite_queue')
    .update({ status: 'en_cours' })
    .eq('id', ligne.id)
    .eq('status', 'en_attente')
    .select()
    .maybeSingle();

  if (!claimed) {
    return { ok: false, erreur: null, transitoire: false };
  }

  const { data: created, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    ligne.email,
    { data: { full_name: ligne.full_name }, redirectTo: `${SITE_URL}/activer-mon-compte` }
  );

  if (inviteErr || !created?.user) {
    const message = inviteErr?.message ?? 'Échec inconnu.';
    // Un dépassement de quota est temporaire : on relâche la ligne (retour
    // à 'en_attente') pour que la tâche planifiée la reprenne
    // automatiquement dès qu'un créneau d'envoi redevient disponible,
    // plutôt que de la laisser bloquée sans suite sur 'echec'.
    const estQuotaDepasse = message.toLowerCase().includes('rate limit');
    await supabaseAdmin
      .from('invite_queue')
      .update(
        estQuotaDepasse ? { status: 'en_attente', erreur: null } : { status: 'echec', erreur: message }
      )
      .eq('id', ligne.id);
    return { ok: false, erreur: message, transitoire: estQuotaDepasse };
  }

  const { error: rolesErr } = await supabaseAdmin
    .from('user_roles')
    .insert(ligne.roles.map((role) => ({ user_id: created.user!.id, role })));

  await supabaseAdmin
    .from('invite_queue')
    .update({
      status: 'envoye',
      sent_at: new Date().toISOString(),
      user_id: created.user.id,
      erreur: rolesErr
        ? "Compte créé et e-mail envoyé, mais les rôles n'ont pas pu être attribués : attribue-les manuellement dans Comptes."
        : null,
    })
    .eq('id', ligne.id);

  return { ok: true, erreur: null, transitoire: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Non authentifié.' }, 401);
    }

    // Client "au nom de l'appelant" : sert uniquement à vérifier qui il est
    // et s'il est administrateur, en respectant les règles RLS normales.
    const supabaseCaller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabaseCaller.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: 'Session invalide.' }, 401);
    }

    const { data: roleRows } = await supabaseCaller
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin');

    if (!roleRows || roleRows.length === 0) {
      return json({ error: "Réservé à l'administrateur." }, 403);
    }

    const body = await req.json();
    const action = body.action ?? 'create';

    // Client "admin" : utilise la clé secrète, disponible uniquement ici,
    // jamais transmise au navigateur.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (action === 'update-password') {
      const { userId, password } = body;
      if (!userId || !password) {
        return json({ error: 'Identifiant et mot de passe requis.' }, 400);
      }
      if (password.length < 8) {
        return json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, 400);
      }

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (updateErr) {
        return json({ error: updateErr.message }, 400);
      }
      return json({ success: true }, 200);
    }

    if (action === 'delete') {
      const { userId } = body;
      if (!userId) {
        return json({ error: 'Identifiant requis.' }, 400);
      }
      if (userId === userData.user.id) {
        return json({ error: 'Tu ne peux pas supprimer ton propre compte.' }, 400);
      }

      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteErr) {
        return json({ error: deleteErr.message }, 400);
      }
      return json({ success: true }, 200);
    }

    if (action === 'queue-invite') {
      const people = Array.isArray(body.people) ? body.people : [];
      if (people.length === 0) {
        return json({ error: 'Aucune personne à mettre en file d\'attente.' }, 400);
      }

      // Validation de chaque ligne avant toute écriture, pour ne jamais
      // insérer une partie seulement du lot en cas d'erreur.
      const lignesValides: { full_name: string; email: string; roles: string[] }[] = [];
      const erreursLignes: { ligne: number; email: string; erreur: string }[] = [];

      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        const full_name = typeof p.full_name === 'string' ? p.full_name.trim() : '';
        const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
        const roles = p.roles;

        if (!full_name) {
          erreursLignes.push({ ligne: i + 1, email, erreur: 'Nom manquant.' });
          continue;
        }
        if (!email || !EMAIL_REGEX.test(email)) {
          erreursLignes.push({ ligne: i + 1, email, erreur: 'E-mail invalide.' });
          continue;
        }
        if (!rolesValides(roles)) {
          erreursLignes.push({ ligne: i + 1, email, erreur: 'Rôle manquant ou invalide (admin, formateur ou arbitre).' });
          continue;
        }
        lignesValides.push({ full_name, email, roles });
      }

      // Doublons à l'intérieur du fichier déposé.
      const emailsVus = new Set<string>();
      const lignesSansDoublonInterne = lignesValides.filter((l) => {
        if (emailsVus.has(l.email)) {
          erreursLignes.push({ ligne: 0, email: l.email, erreur: 'E-mail en double dans le fichier déposé.' });
          return false;
        }
        emailsVus.add(l.email);
        return true;
      });

      // Comptes déjà existants (requête sautée si aucune ligne valide,
      // un tableau vide passé à .in() serait rejeté par PostgREST).
      let emailsExistants = new Set<string>();
      if (lignesSansDoublonInterne.length > 0) {
        const { data: profilsExistants } = await supabaseAdmin
          .from('profiles')
          .select('email')
          .in('email', lignesSansDoublonInterne.map((l) => l.email));
        emailsExistants = new Set((profilsExistants ?? []).map((p) => p.email.toLowerCase()));
      }

      // Déjà en file d'attente.
      const { data: dejaEnAttente } = await supabaseAdmin
        .from('invite_queue')
        .select('email')
        .eq('status', 'en_attente');
      const emailsEnAttente = new Set((dejaEnAttente ?? []).map((r) => r.email.toLowerCase()));

      const aInserer = lignesSansDoublonInterne.filter((l) => {
        if (emailsExistants.has(l.email)) {
          erreursLignes.push({ ligne: 0, email: l.email, erreur: 'Un compte existe déjà avec cet e-mail.' });
          return false;
        }
        if (emailsEnAttente.has(l.email)) {
          erreursLignes.push({ ligne: 0, email: l.email, erreur: 'Déjà en file d\'attente.' });
          return false;
        }
        return true;
      });

      if (aInserer.length === 0) {
        return json({ queued: 0, erreurs: erreursLignes }, 200);
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('invite_queue')
        .insert(
          aInserer.map((l) => ({
            full_name: l.full_name,
            email: l.email,
            roles: l.roles,
            created_by: userData.user.id,
          }))
        )
        .select('id, full_name, email, roles');

      if (insertErr || !inserted) {
        return json({ error: "La mise en file d'attente a échoué. Réessaie dans un instant." }, 400);
      }

      // Si personne n'attendait déjà dans la file, on envoie tout de suite
      // le tout premier e-mail de ce lot plutôt que de faire patienter
      // jusqu'à 30 minutes (cas le plus courant : ajout d'une seule
      // personne à la fois). S'il y en a d'autres dans ce même lot (import
      // en masse), elles restent en file, traitées comme d'habitude par
      // la tâche planifiée.
      let envoyeImmediatement = false;
      let echecImmediat: string | null = null;
      if (emailsEnAttente.size === 0) {
        const premiere = inserted.find((l) => l.email === aInserer[0].email);
        if (premiere) {
          const resultat = await envoyerInvitationMaintenant(
            supabaseAdmin,
            premiere as { id: string; full_name: string; email: string; roles: string[] }
          );
          envoyeImmediatement = resultat.ok;
          // Un échec transitoire (quota) remet la ligne en file d'attente
          // normale (voir envoyerInvitationMaintenant) : ce n'est pas un
          // échec à signaler, juste une invitation qui sera reprise
          // automatiquement au prochain passage de la tâche planifiée.
          if (!resultat.ok && resultat.erreur && !resultat.transitoire) {
            echecImmediat = resultat.erreur;
          }
        }
      }

      const dejaTraite = (envoyeImmediatement ? 1 : 0) + (echecImmediat ? 1 : 0);
      const nombreRestantEnFile = aInserer.length - dejaTraite;
      const dernierEnvoiEstime =
        nombreRestantEnFile > 0
          ? new Date(Date.now() + (emailsEnAttente.size + nombreRestantEnFile) * 30 * 60_000).toISOString()
          : null;

      return json(
        { queued: aInserer.length, erreurs: erreursLignes, envoyeImmediatement, echecImmediat, dernierEnvoiEstime },
        200
      );
    }

    if (action === 'generate-invite-link') {
      const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const roles = body.roles;

      if (!full_name || !email || !EMAIL_REGEX.test(email)) {
        return json({ error: 'Nom complet et e-mail valides requis.' }, 400);
      }
      if (!rolesValides(roles)) {
        return json({ error: 'Au moins un rôle est requis.' }, 400);
      }

      // Un compte existe-t-il déjà pour cet e-mail ? (ex. invitation
      // envoyée précédemment dont le lien a expiré ou a été perdu).
      // Supabase refuse de recréer un compte existant avec type "invite" ;
      // on génère alors un lien de type "recovery", qui fonctionne pour un
      // compte déjà existant et permet exactement la même chose : arriver
      // sur la page d'activation et choisir son mot de passe. Les rôles ne
      // sont pas réattribués dans ce cas (déjà en place depuis la première
      // invitation) ; l'admin peut les ajuster depuis la fiche du compte.
      const { data: profilExistant } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      if (profilExistant) {
        const { data: linkRenvoi, error: erreurRenvoi } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${SITE_URL}/activer-mon-compte` },
        });
        if (erreurRenvoi || !linkRenvoi?.properties?.action_link) {
          return json({ error: erreurRenvoi?.message ?? 'Échec de la génération du lien.' }, 400);
        }
        return json(
          { id: profilExistant.id, link: linkRenvoi.properties.action_link, renvoi: true },
          200
        );
      }

      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { full_name },
          redirectTo: `${SITE_URL}/activer-mon-compte`,
        },
      });

      if (linkErr || !linkData?.user) {
        return json({ error: traduireErreurCreation(linkErr?.message ?? 'Échec de la création.') }, 400);
      }

      const { error: rolesErr } = await supabaseAdmin
        .from('user_roles')
        .insert(roles.map((role: string) => ({ user_id: linkData.user!.id, role })));

      if (rolesErr) {
        return json({ error: 'Compte créé mais les rôles n\'ont pas pu être attribués. Attribue-les manuellement.' }, 200);
      }

      return json({ id: linkData.user.id, link: linkData.properties?.action_link, renvoi: false }, 200);
    }

    return json({ error: 'Action inconnue.' }, 400);
  } catch (_e) {
    return json({ error: 'Erreur inattendue côté serveur.' }, 500);
  }
});

function traduireErreurCreation(message: string): string {
  if (message.toLowerCase().includes('already') || message.toLowerCase().includes('registered')) {
    return 'Un compte existe déjà avec cet e-mail.';
  }
  return message;
}
