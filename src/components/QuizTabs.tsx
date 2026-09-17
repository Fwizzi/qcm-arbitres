import { Link, useLocation } from 'react-router-dom';

export default function QuizTabs({ quizId }: { quizId: string }) {
  const location = useLocation();

  const onglets = [
    { label: 'Paramètres', to: `/formateur/qcm/${quizId}` },
    { label: 'Questions', to: `/formateur/qcm/${quizId}/questions` },
    { label: 'Résultats', to: `/formateur/qcm/${quizId}/resultats` },
  ];

  return (
    <div className="flex gap-1 bg-canvas border border-border rounded p-1 mb-4 w-fit">
      {onglets.map((o) => {
        const actif = location.pathname === o.to;
        return (
          <Link
            key={o.to}
            to={o.to}
            className={
              'px-3 py-1.5 text-sm rounded ' +
              (actif ? 'bg-pitch text-white font-medium' : 'text-muted')
            }
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
