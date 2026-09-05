import { useNavigate } from 'react-router-dom';
import { useAuth, type AppRole } from '../hooks/useAuth';

const LABELS: Record<AppRole, string> = {
  admin: 'Administrateur',
  formateur: 'Formateur',
  arbitre: 'Arbitre',
};

export default function RoleSwitcher() {
  const { roles, activeRole, setActiveRole } = useAuth();
  const navigate = useNavigate();

  // Un compte à rôle unique n'a pas besoin de sélecteur.
  if (roles.length < 2) return null;

  function handleChange(role: AppRole) {
    setActiveRole(role);
    navigate(`/${role}`);
  }

  return (
    <div className="flex gap-1 bg-canvas border border-border rounded p-1 w-fit">
      {roles.map((role) => (
        <button
          key={role}
          onClick={() => handleChange(role)}
          className={
            'px-3 py-1.5 text-sm rounded ' +
            (activeRole === role ? 'bg-pitch text-white font-medium' : 'text-muted')
          }
        >
          {LABELS[role]}
        </button>
      ))}
    </div>
  );
}
