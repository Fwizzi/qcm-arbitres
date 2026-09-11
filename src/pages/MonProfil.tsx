import { useState, type FormEvent } from 'react';
import AppLayout from '../components/AppLayout';
import { supabase } from '../lib/supabaseClient';

export default function MonProfil() {
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setSucces(false);

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
      setErreur("La mise à jour a échoué. Réessaie dans un instant.");
      return;
    }
    setMotDePasse('');
    setConfirmation('');
    setSucces(true);
  }

  return (
    <AppLayout>
      <h1 className="text-lg font-semibold mb-4">Mon mot de passe</h1>

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded p-4">
        <label className="block text-sm text-muted mb-1">Nouveau mot de passe</label>
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
        {succes && (
          <p className="text-sm text-pitch-dark bg-pitch-light rounded px-3 py-2 mb-3">
            Mot de passe mis à jour avec succès.
          </p>
        )}

        <button
          type="submit"
          disabled={enregistrement}
          className="w-full bg-pitch text-white font-medium rounded py-2 disabled:opacity-60"
        >
          {enregistrement ? 'Enregistrement…' : 'Mettre à jour le mot de passe'}
        </button>
      </form>
    </AppLayout>
  );
}
