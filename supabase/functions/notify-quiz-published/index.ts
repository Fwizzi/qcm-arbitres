// Fonction Supabase Edge Function : envoie un e-mail de notification à tous
// les arbitres des groupes ciblés par un QCM, au moment de sa publication.
//
// Contrairement aux mails de Comptes.tsx (invite-user, magic-link, etc.),
// ce mail n'est PAS un mail d'authentification Supabase : il est envoyé
// directement par SMTP (Gmail) depuis cette fonction, avec ses propres
// identifiants — voir les variables d'environnement ci-dessous.
//
// Appelée une seule fois, au tout premier passage d'un QCM en "published"
// (voir QuizForm.tsx : le client ne l'appelle que si l'ancien statut
// n'était pas déjà 'published', pour ne jamais renvoyer le mail à chaque
// republication/modification).
//
// Choix assumé (demandé explicitement) : envoi direct, séquentiel, espacé
// de 2 secondes entre deux mails — pas de file d'attente durable comme pour
// les invitations. Une fonction Supabase a une durée de vie maximale
// (150s en plan gratuit, 400s en plan payant) ; au-delà, les derniers
// destinataires d'un très grand groupe ne recevraient pas le mail. Avec
// ~60 arbitres et 2s d'intervalle (~120s rien que pour les pauses, plus le
// temps d'envoi lui-même), on est proche de la limite du plan gratuit :
// à vérifier/upgrader côté Supabase si besoin de marge.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@^9';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://fwizzi.github.io/qcm-arbitres';
const DELAI_ENTRE_ENVOIS_MS = 2000;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Le fuseau horaire est fixé explicitement à Europe/Paris : cette fonction
// s'exécute sur les serveurs Supabase, en UTC par défaut, ce qui afficherait
// sinon une heure décalée (1h ou 2h selon l'heure d'été/hiver) par rapport
// à l'heure réelle vue par les arbitres en France.
function formaterDateHeure(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return `${date} à ${heure}`;
}

function construireEmailHtml(prenom: string, titreQuiz: string, periodStart: string, periodEnd: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nouveau QCM — QCM Arbitres</title>
</head>
<body style="margin:0;padding:0;background:#F7F7F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F5;padding:32px 16px;font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;">

        <tr><td style="background:#E6F0EA;padding:20px 0;text-align:center;">
          <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ballon de handball">
            <g stroke="#164F35" stroke-width="2" opacity="0.45" stroke-linecap="round">
              <line x1="4" y1="20" x2="13" y2="23"/>
              <line x1="2" y1="28" x2="12" y2="29"/>
              <line x1="4" y1="36" x2="13" y2="34"/>
            </g>
            <circle cx="35" cy="29" r="18" fill="#164F35"/>
            <path d="M21,19 Q35,12 49,19" fill="none" stroke="#E6F0EA" stroke-width="2" opacity="0.7"/>
            <path d="M23,39 Q35,45 47,39" fill="none" stroke="#0E2A1C" stroke-width="2" opacity="0.5"/>
          </svg>
        </td></tr>

        <tr><td style="padding:30px 40px 6px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#C99A2E;font-weight:700;font-family:Inter,Arial,sans-serif;">Ballon en main</p>
          <h1 style="margin:0 0 14px;font-size:21px;color:#1A1D1B;font-family:Inter,Arial,sans-serif;">Un nouveau QCM t'attend</h1>
        </td></tr>

        <tr><td style="padding:0 40px 30px;text-align:center;">
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#1A1D1B;font-family:Inter,Arial,sans-serif;">Bonjour ${prenom},<br/><br/>Le QCM « <strong>${titreQuiz}</strong> » vient d'être mis à ta disposition sur QCM Arbitres. Il sera accessible du <strong>${formaterDateHeure(periodStart)}</strong> au <strong>${formaterDateHeure(periodEnd)}</strong>.</p>
          <a href="${SITE_URL}/login" style="display:inline-block;background:#C99A2E;color:#1A1D1B;text-decoration:none;font-size:15px;font-weight:700;padding:12px 32px;border-radius:24px;font-family:Inter,Arial,sans-serif;">Se connecter</a>
        </td></tr>

        <tr><td style="padding:18px 40px;border-top:1px solid #E3E1DB;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#6B6B64;font-family:Inter,Arial,sans-serif;">Tu reçois ce mail car ton compte QCM Arbitres est rattaché à un groupe concerné par ce QCM.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function envoyerVersDestinataires(
  transport: ReturnType<typeof nodemailer.createTransport>,
  destinataires: { email: string; full_name: string }[],
  quiz: { title: string; period_start: string; period_end: string }
) {
  for (const dest of destinataires) {
    try {
      await new Promise<void>((resolve, reject) => {
        transport.sendMail(
          {
            from: `"QCM Arbitres" <${Deno.env.get('SMTP_USERNAME')}>`,
            to: dest.email,
            subject: `Nouveau QCM disponible : ${quiz.title}`,
            html: construireEmailHtml(dest.full_name, quiz.title, quiz.period_start, quiz.period_end),
          },
          (error: Error | null) => (error ? reject(error) : resolve())
        );
      });
      console.log(`notify-quiz-published: envoyé à ${dest.email}`);
    } catch (e) {
      console.error(`notify-quiz-published: échec envoi à ${dest.email} —`, e);
    }
    await new Promise((r) => setTimeout(r, DELAI_ENTRE_ENVOIS_MS));
  }
  console.log(`notify-quiz-published: terminé (${destinataires.length} destinataire(s) traité(s))`);
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
      .in('role', ['formateur', 'admin']);

    if (!roleRows || roleRows.length === 0) {
      return json({ error: 'Réservé aux formateurs et administrateurs.' }, 403);
    }

    const body = await req.json();
    const quizId = body.quizId as string | undefined;
    if (!quizId) {
      return json({ error: 'quizId requis.' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: quiz, error: quizErr } = await supabaseAdmin
      .from('quizzes')
      .select('id, title, status, period_start, period_end')
      .eq('id', quizId)
      .single();

    if (quizErr || !quiz) {
      return json({ error: 'QCM introuvable.' }, 404);
    }
    if (quiz.status !== 'published') {
      return json({ error: "Ce QCM n'est pas publié." }, 400);
    }

    const { data: qg } = await supabaseAdmin.from('quiz_groups').select('group_id').eq('quiz_id', quizId);
    const groupIds = (qg ?? []).map((r) => r.group_id);
    if (groupIds.length === 0) {
      return json({ started: false, recipients: 0, message: 'Aucun groupe ciblé.' }, 200);
    }

    const { data: membres } = await supabaseAdmin
      .from('group_members')
      .select('user_id')
      .in('group_id', groupIds);
    const userIds = Array.from(new Set((membres ?? []).map((r) => r.user_id)));
    if (userIds.length === 0) {
      return json({ started: false, recipients: 0, message: 'Aucun arbitre dans ces groupes.' }, 200);
    }

    const { data: profils } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .in('id', userIds);
    const destinataires = profils ?? [];
    if (destinataires.length === 0) {
      return json({ started: false, recipients: 0, message: 'Aucune adresse e-mail trouvée.' }, 200);
    }

    const transport = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOSTNAME')!,
      port: Number(Deno.env.get('SMTP_PORT')!),
      secure: false,
      auth: {
        user: Deno.env.get('SMTP_USERNAME')!,
        pass: Deno.env.get('SMTP_PASSWORD')!,
      },
    });

    // Réponse immédiate au client ; l'envoi (espacé de 2s par destinataire)
    // continue en tâche de fond. Voir les logs de cette fonction dans le
    // dashboard Supabase pour suivre les envois/échecs individuels — il n'y
    // a pas de statut renvoyé au formateur au-delà de ce message initial.
    EdgeRuntime.waitUntil(envoyerVersDestinataires(transport, destinataires, quiz));

    return json({ started: true, recipients: destinataires.length }, 200);
  } catch (_e) {
    return json({ error: 'Erreur inattendue côté serveur.' }, 500);
  }
});
