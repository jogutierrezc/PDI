import type { InitiativeCardData } from "../../types/pdi";

interface InitiativeCardProps {
  initiative: InitiativeCardData;
}

export function InitiativeCard({ initiative }: InitiativeCardProps) {
  return (
    <article className="initiative-card">
      <div className="initiative-card__head">
        <h3>{initiative.title}</h3>
        <span className="initiative-status">{initiative.status}</span>
      </div>
      <p className="initiative-owner">{initiative.owner}</p>
      <p className="initiative-description">{initiative.description}</p>
    </article>
  );
}

