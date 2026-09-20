import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';

// Page atteinte via le lien d'activation (envoyé par e-mail, ou transmis
// manuellement par l'administrateur). Le clic sur ce lien établit déjà
// une session Supabase temporaire ; cette page se contente de demander
// à la personne de choisir son mot de passe pour la finaliser.
export default function ActiverCompte() {
  const { session, loading, profile } = useAuth();
  const navigate = useNavigate();
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setEnregistrement(true);
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    setEnregistrement(false);

    if (error) {
      setErreur(
        "L'activation a échoué. Le lien a peut-être expiré — demande à ton administrateur de t'en envoyer un nouveau."
      );
      return;
    }
    navigate('/', { replace: true });
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted">Chargement…</p>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">Lien invalide ou expiré</h1>
          <p className="text-sm text-muted">
            Ce lien d'activation n'est plus valable. Demande à ton administrateur de t'en envoyer un nouveau.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">
          Bienvenue{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="text-sm text-muted mb-6">
          Choisis ton mot de passe pour activer ton compte QCM Arbitres.
        </p>

        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded p-5">
          <label className="block text-sm text-muted mb-1">Mot de passe</label>
          <input
            type="password"
            required
            minLength={8}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 mb-3"
          />

          <label className="block text-sm text-muted mb-1">Confirmer le mot de passe</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 mb-1"
          />
          <p className="text-xs text-muted mb-3">8 caractères minimum.</p>

          {erreur && (
            <p role="alert" className="text-sm text-card-red bg-card-red-bg rounded px-3 py-2 mb-3">
              {erreur}
            </p>
          )}

          <button
            type="submit"
            disabled={enregistrement}
            className="w-full bg-pitch text-white font-medium rounded py-2 disabled:opacity-60"
          >
            {enregistrement ? 'Activation…' : 'Activer mon compte'}
          </button>
        </form>
      </div>
    </div>
  );
}
