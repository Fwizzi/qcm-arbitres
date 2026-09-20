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

      const { error: insertErr } = await supabaseAdmin.from('invite_queue').insert(
        aInserer.map((l) => ({
          full_name: l.full_name,
          email: l.email,
          roles: l.roles,
          created_by: userData.user.id,
        }))
      );

      if (insertErr) {
        return json({ error: "La mise en file d'attente a échoué. Réessaie dans un instant." }, 400);
      }

      const positionDepart = emailsEnAttente.size; // nombre déjà devant ce lot
      const dernierEnvoiEstime = new Date(
        Date.now() + (positionDepart + aInserer.length) * 30 * 60_000
      ).toISOString();

      return json(
        { queued: aInserer.length, erreurs: erreursLignes, dernierEnvoiEstime },
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

      return json({ id: linkData.user.id, link: linkData.properties?.action_link }, 200);
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
