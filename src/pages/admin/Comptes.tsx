import { useEffect, useState, type FormEvent } from 'react';
import AppLayout from '../../components/AppLayout';
import AdminNav from '../../components/AdminNav';
import { supabase } from '../../lib/supabaseClient';
import { extraireErreurFonction } from '../../lib/functionsError';
import { logActivity } from '../../lib/activityLog';
import type { AppRole } from '../../hooks/useAuth';

interface PersonneAvecRoles {
  id: string;
  full_name: string;
  email: string;
  roles: AppRole[];
}

const TOUS_LES_ROLES: AppRole[] = ['admin', 'formateur', 'arbitre'];
const LABELS: Record<AppRole, string> = {
  admin: 'Administrateur',
  formateur: 'Formateur',
  arbitre: 'Arbitre',
};

export default function Comptes() {
  const [personnes, setPersonnes] = useState<PersonneAvecRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [nomEdite, setNomEdite] = useState('');
  const [enregistrementNom, setEnregistrementNom] = useState(false);
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState('');
  const [enregistrementMdp, setEnregistrementMdp] = useState(false);
  const [erreurMdp, setErreurMdp] = useState<string | null>(null);
  const [succesMdp, setSuccesMdp] = useState(false);
  const [confirmationSuppression, setConfirmationSuppression] = useState<string | null>(null);
  const [avertissementSuppression, setAvertissementSuppression] = useState<string | null>(null);
  const [suppression, setSuppression] = useState(false);
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nomComplet, setNomComplet] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreurCreation, setErreurCreation] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  async function charger() {
    setLoading(true);
    setError(null);

    const [{ data: profils, error: err1 }, { data: roleRows, error: err2 }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    if (err1 || err2) {
      setError('Impossible de charger la liste des comptes. Réessaie dans un instant.');
      setLoading(false);
      return;
    }

    const liste: PersonneAvecRoles[] = (profils ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      roles: (roleRows ?? [])
        .filter((r) => r.user_id === p.id)
        .map((r) => r.role as AppRole),
    }));
    setPersonnes(liste);
    setLoading(false);
  }

  useEffect(() => {
    charger();
  }, []);

  async function basculerRole(personneId: string, role: AppRole, actif: boolean) {
    setEnregistrement(true);
    if (actif) {
      await supabase.from('user_roles').delete().eq('user_id', personneId).eq('role', role);
    } else {
      await supabase.from('user_roles').insert({ user_id: personneId, role });
    }
    await charger();
    setEnregistrement(false);
  }

  function ouvrirPanneau(p: PersonneAvecRoles) {
    const memePersonne = ouvert === p.id;
    setOuvert(memePersonne ? null : p.id);
    setNomEdite(p.full_name);
    setNouveauMotDePasse('');
    setErreurMdp(null);
    setSuccesMdp(false);
    setConfirmationSuppression(null);
    setAvertissementSuppression(null);
    setErreurSuppression(null);
  }

  async function enregistrerNom(personneId: string) {
    setEnregistrementNom(true);
    const { error } = await supabase.from('profiles').update({ full_name: nomEdite }).eq('id', personneId);
    setEnregistrementNom(false);
    if (!error) {
      await logActivity(`a modifié le nom de ${nomEdite}`, 'profile', personneId);
      await charger();
    }
  }

  async function reinitialiserMotDePasse(personneId: string, nomPersonne: string) {
    setErreurMdp(null);
    setSuccesMdp(false);
    if (nouveauMotDePasse.length < 8) {
      setErreurMdp('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    setEnregistrementMdp(true);
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action: 'update-password', userId: personneId, password: nouveauMotDePasse },
    });
    setEnregistrementMdp(false);

    if (error || data?.error) {
      setErreurMdp(await extraireErreurFonction(error, data));
      return;
    }
    setNouveauMotDePasse('');
    setSuccesMdp(true);
    await logActivity(`a réinitialisé le mot de passe de ${nomPersonne}`, 'profile', personneId);
  }

  async function demanderConfirmationSuppression(p: PersonneAvecRoles) {
    setErreurSuppression(null);
    setAvertissementSuppression(null);

    if (p.roles.includes('formateur')) {
      const { count } = await supabase
        .from('quizzes')
        .select('id', { count: 'exact', head: true })
        .eq('formateur_id', p.id);
      if (count && count > 0) {
        setAvertissementSuppression(
          `Ce formateur a créé ${count} QCM. Les supprimer entraînera la perte définitive de leurs questions et de toutes les réponses des arbitres qui y ont déjà répondu.`
        );
      }
    }
    setConfirmationSuppression(p.id);
  }

  async function supprimerCompte(personneId: string, nomPersonne: string) {
    setSuppression(true);
    setErreurSuppression(null);
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action: 'delete', userId: personneId },
    });
    setSuppression(false);

    if (error || data?.error) {
      setErreurSuppression(await extraireErreurFonction(error, data));
      return;
    }
    setConfirmationSuppression(null);
    setOuvert(null);
    await logActivity(`a supprimé le compte de ${nomPersonne}`, 'profile', personneId);
    await charger();
  }

  async function creerCompte(e: FormEvent) {
    e.preventDefault();
    setErreurCreation(null);
    setCreation(true);

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { email, password: motDePasse, full_name: nomComplet },
    });

    setCreation(false);

    if (error || data?.error) {
      setErreurCreation(await extraireErreurFonction(error, data));
      return;
    }

    setNomComplet('');
    setEmail('');
    setMotDePasse('');
    setFormulaireOuvert(false);
    await logActivity(`a créé le compte de ${nomComplet}`, 'profile', data?.id);
    await charger();
  }

  function initiales(nom: string) {
    return nom
      .split(' ')
      .filter(Boolean)
      .map((mot) => mot[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <AppLayout>
      <AdminNav />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Comptes</h1>
        <button
          type="button"
          className="text-sm border border-border rounded px-3 py-1.5"
          onClick={() => setFormulaireOuvert((v) => !v)}
        >
          + Nouveau
        </button>
      </div>

      {formulaireOuvert && (
        <form onSubmit={creerCompte} className="bg-surface border border-border rounded p-4 mb-4">
          <label className="block text-sm text-muted mb-1">Nom complet</label>
          <input
            type="text"
            required
            value={nomComplet}
            onChange={(e) => setNomComplet(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 mb-3"
          />

          <label className="block text-sm text-muted mb-1">E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 mb-3"
          />

          <label className="block text-sm text-muted mb-1">Mot de passe provisoire</label>
          <input
            type="text"
            required
            minLength={8}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 mb-1"
          />
          <p className="text-xs text-muted mb-3">
            8 caractères minimum. Transmets-le à la personne concernée ; elle pourra le changer
            une fois connectée.
          </p>

          {erreurCreation && (
            <p role="alert" className="text-sm text-card-red bg-card-red-bg rounded px-3 py-2 mb-3">
              {erreurCreation}
            </p>
          )}

          <button
            type="submit"
            disabled={creation}
            className="w-full bg-pitch text-white font-medium rounded py-2 disabled:opacity-60"
          >
            {creation ? 'Création…' : 'Créer le compte'}
          </button>
        </form>
      )}

      {loading && <p className="text-sm text-muted">Chargement…</p>}
      {error && <p className="text-sm text-card-red">{error}</p>}

      <ul>
        {personnes.map((p) => (
          <li key={p.id} className="border-b border-border py-3">
            <button
              type="button"
              className="w-full flex items-start gap-3 text-left"
              onClick={() => ouvrirPanneau(p)}
              aria-expanded={ouvert === p.id}
            >
              <span className="w-9 h-9 rounded-full bg-pitch-light text-pitch-dark flex items-center justify-center text-sm font-medium shrink-0">
                {initiales(p.full_name)}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{p.full_name}</span>
                <span className="block text-xs text-muted mb-1.5">{p.email}</span>
                <span className="flex gap-1 flex-wrap">
                  {p.roles.length === 0 && (
                    <span className="text-xs text-muted">Aucun rôle attribué</span>
                  )}
                  {p.roles.map((r) => (
                    <span
                      key={r}
                      className="text-xs bg-pitch-light text-pitch-dark rounded px-2 py-0.5"
                    >
                      {LABELS[r]}
                    </span>
                  ))}
                </span>
              </span>
            </button>

            {ouvert === p.id && (
              <div className="mt-3 pl-12 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  {TOUS_LES_ROLES.map((role) => {
                    const actif = p.roles.includes(role);
                    return (
                      <label key={role} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={actif}
                          disabled={enregistrement}
                          onChange={() => basculerRole(p.id, role, actif)}
                        />
                        {LABELS[role]}
                      </label>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs text-muted mb-1">Nom complet</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nomEdite}
                      onChange={(e) => setNomEdite(e.target.value)}
                      className="flex-1 border border-border rounded px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => enregistrerNom(p.id)}
                      disabled={enregistrementNom || !nomEdite.trim() || nomEdite === p.full_name}
                      className="text-xs border border-border rounded px-3 disabled:opacity-50"
                    >
                      {enregistrementNom ? '…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-muted mb-1">Réinitialiser le mot de passe</label>
                  <div className="flex gap-2 mb-1">
                    <input
                      type="text"
                      placeholder="Nouveau mot de passe"
                      value={nouveauMotDePasse}
                      onChange={(e) => setNouveauMotDePasse(e.target.value)}
                      className="flex-1 border border-border rounded px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => reinitialiserMotDePasse(p.id, p.full_name)}
                      disabled={enregistrementMdp || !nouveauMotDePasse}
                      className="text-xs border border-border rounded px-3 disabled:opacity-50"
                    >
                      {enregistrementMdp ? '…' : 'Réinitialiser'}
                    </button>
                  </div>
                  {erreurMdp && <p className="text-xs text-card-red">{erreurMdp}</p>}
                  {succesMdp && <p className="text-xs text-pitch-dark">Mot de passe mis à jour.</p>}
                  <p className="text-xs text-muted">
                    8 caractères minimum. Transmets-le à la personne concernée.
                  </p>
                </div>

                <div className="pt-3 border-t border-border">
                  {confirmationSuppression !== p.id ? (
                    <button
                      type="button"
                      onClick={() => demanderConfirmationSuppression(p)}
                      className="w-full text-xs border border-border rounded py-1.5 text-card-red"
                    >
                      Supprimer ce compte
                    </button>
                  ) : (
                    <div>
                      {avertissementSuppression && (
                        <p className="text-xs text-card-red bg-card-red-bg rounded px-3 py-2 mb-2">
                          {avertissementSuppression}
                        </p>
                      )}
                      <p className="text-sm mb-2">Confirmer la suppression définitive de ce compte ?</p>
                      {erreurSuppression && (
                        <p className="text-xs text-card-red mb-2">{erreurSuppression}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmationSuppression(null)}
                          className="flex-1 border border-border rounded py-1.5 text-xs"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => supprimerCompte(p.id, p.full_name)}
                          disabled={suppression}
                          className="flex-1 bg-card-red text-white rounded py-1.5 text-xs disabled:opacity-60"
                        >
                          {suppression ? 'Suppression…' : 'Supprimer définitivement'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!loading && !error && personnes.length === 0 && (
        <p className="text-sm text-muted">Aucun compte pour le moment.</p>
      )}
    </AppLayout>
  );
}
