import { NavLink } from 'react-router-dom';

const liens = [
  { to: '/arbitre', label: 'Mes QCM', end: true },
  { to: '/arbitre/historique', label: 'Historique' },
];

export default function ArbitreNav() {
  return (
    <nav className="flex gap-4 border-b border-border mb-5 text-sm">
      {liens.map((lien) => (
        <NavLink
          key={lien.to}
          to={lien.to}
          end={lien.end}
          className={({ isActive }) =>
            'pb-2 -mb-px border-b-2 ' +
            (isActive ? 'border-pitch text-pitch font-medium' : 'border-transparent text-muted')
          }
        >
          {lien.label}
        </NavLink>
      ))}
    </nav>
  );
}
