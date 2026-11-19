import { registrationChoices } from '../lib/tournament-registration';
import { ArrowUpRight, CalendarDays, Clock, MapPin, Ticket } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

type TournamentSummary = {
  id: string;
  title: string;
  description?: string;
  date?: string;
  deadline?: string;
  venue?: string;
  image?: string;
  fee?: number;
  registrationMode?: string;
  status: string;
};

type TournamentCardProps = {
  tournament: TournamentSummary;
  Link: ComponentType<{ to: string; className?: string; children: ReactNode }>;
  formatDate: (value: string) => string;
  formatFee: (value: number) => string;
  featured?: boolean;
};

export default function TournamentCard({ tournament, Link, formatDate, formatFee, featured = false }: TournamentCardProps) {
  const choices = registrationChoices(tournament);
  const isOpen = tournament.status === 'open' && choices.length > 0 && (!tournament.deadline || Date.now() <= Date.parse(tournament.deadline+'T23:59:59+05:30'));
  const status = isOpen ? 'Registration open' : (tournament.status === 'closed'||!choices.length) ? 'Registration closed' : 'Registration not open';

  return (
    <article className="tournament-card">
      {tournament.image && (
        <img className="tournament-card-photo" src={tournament.image} alt={tournament.title} loading="lazy" />
      )}
      <div className="tournament-card-body">
        <span className="tournament-status">{status}</span>
        <h3>{tournament.title}</h3>
        {tournament.description && <p className="tournament-card-description">{tournament.description}</p>}
        <dl className="tournament-facts">
          <div className="tournament-card-date">
            <dt><CalendarDays size={15} aria-hidden="true" /> Event date</dt>
            <dd>{formatDate(tournament.date || '')}</dd>
          </div>
          <div className="tournament-card-fee">
            <dt><Ticket size={15} aria-hidden="true" /> Entry fee</dt>
            <dd>{choices.length===0 ? 'Registration unavailable' : choices.some(choice => choice !== 'free') ? <>{formatFee(tournament.fee||0)} <span>per participant{choices.includes('free')?' · Free option':''}</span></> : 'Free'}</dd>
          </div>
          <div className="tournament-card-venue">
            <dt><MapPin size={15} aria-hidden="true" /> Venue</dt>
            <dd>{tournament.venue || 'To be announced'}</dd>
          </div>
          {tournament.deadline && (
            <div className="tournament-card-deadline">
              <dt><Clock size={15} aria-hidden="true" /> Register by</dt>
              <dd>{formatDate(tournament.deadline)}</dd>
            </div>
          )}
        </dl>
        <Link to={'/tournaments/' + tournament.id} className="btn pale tournament-card-action">
          {featured && isOpen ? <><span className="desktop-label">Details &amp; registration</span><span className="mobile-label">Register</span></> : 'View details'}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
