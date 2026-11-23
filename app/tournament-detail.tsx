import AssetImage from './asset-image';
import {useState} from 'react';
import { registrationChoices, type RegistrationChoice } from '../lib/tournament-registration';
import ReadableCopy from './readable-copy';
import { ArrowLeft, CalendarDays, Clock, Download, Expand, MapPin, Users, X } from 'lucide-react';
import { useRef } from 'react';
import type { ComponentType, ReactNode } from 'react';

type Tournament = {
  title: string;
  description?: string;
  date?: string;
  deadline?: string;
  venue?: string;
  image?: string;
  fee?: number;
  registrationMode?: string;
  status?: string;
  categories?: string;
  eligibility?: string;
  rules?: string;
  document?: string;
};

type TournamentDetailProps = {
  tournament: Tournament;
  Link: ComponentType<{ to: string; className?: string; children: ReactNode }>;
  formatDate: (value: string) => string;
  formatFee: (value: number) => string;
  onRegister: (kind: 'tournament' | 'team', choice: RegistrationChoice) => void;
};

export default function TournamentDetail({ tournament, Link, formatDate, formatFee, onRegister }: TournamentDetailProps) {
  const photoDialog = useRef<HTMLDialogElement>(null);
  const [now]=useState(()=>Date.now());
  const choices = registrationChoices(tournament);
  const isOpen = tournament.status === 'open' && choices.length > 0 && (!tournament.deadline || now <= Date.parse(tournament.deadline+'T23:59:59+05:30'));
  const sections = [
    ['Categories', tournament.categories],
    ['Eligibility', tournament.eligibility],
    ['Rules & guidelines', tournament.rules],
  ];

  return (
    <>
      <header className="page-heading tournament-heading wrap">
        <div className="tournament-detail-nav">
          <Link to="/tournaments" className="text-link">
            <ArrowLeft size={16} aria-hidden="true" /> Tournaments
          </Link>
          <span className="badge">
            {isOpen ? 'Registration open' : tournament.status === 'closed' ? 'Closed' : 'Not open yet'}
          </span>
        </div>
        <h1>{tournament.title}</h1>
        {tournament.description && <ReadableCopy text={tournament.description} />}
      </header>

      <section className="section wrap detail-grid tournament-detail">
        <div className="tournament-overview">
          {tournament.image && (
            <figure className="tournament-media">
              <AssetImage className="tournament-detail-photo" src={tournament.image} alt={tournament.title} fetchPriority="high" />
              <button type="button" className="tournament-photo-open" aria-haspopup="dialog"
                onClick={() => photoDialog.current?.showModal()}>
                <Expand size={14} aria-hidden="true" /> Full photo
              </button>
            </figure>
          )}
          <div className="detail-metas">
            <div className="detail-meta">
              <CalendarDays aria-hidden="true" />
              <div><small className="detail-meta-label">Event date</small>{formatDate(tournament.date || '')}</div>
            </div>
            <div className="detail-meta">
              <MapPin aria-hidden="true" />
              <div><small className="detail-meta-label">Venue</small>{tournament.venue || 'To be announced'}</div>
            </div>
            {tournament.deadline && (
              <div className="detail-meta">
                <Clock aria-hidden="true" />
                <div><small className="detail-meta-label">Register by</small>{formatDate(tournament.deadline)}</div>
              </div>
            )}
          </div>
        </div>

        <aside className="booking-card tournament-registration">
          <div className="tournament-fee">
            <span className="eyebrow">Registration Fee</span>
            <h2>{choices.some(choice => choice !== 'free') ? formatFee(tournament.fee || 0) : 'FREE'}</h2>
            <p>Per participant</p>
          </div>
          <hr />
          <p>Individual and academy team registrations</p>
          {isOpen && choices.map(choice => (
            <fieldset className="tournament-registration-option" key={choice}>
              <legend>{choice === 'manual' ? 'UPI QR payment' : choice === 'paid' ? 'Pay online (Razorpay)' : 'Register without payment'}</legend>
              <div className="tournament-registration-actions">
                <button type="button" className="btn red" onClick={() => onRegister('tournament', choice)}>
                  {choice === 'free' ? 'Register individual' : 'Individual & pay'}
                </button>
                <button type="button" className="btn pale tournament-team-button" onClick={() => onRegister('team', choice)}>
                  {choice === 'free' ? 'Register team' : 'Team & pay'}
                  <Users size={17} aria-hidden="true" />
                </button>
              </div>
            </fieldset>
          ))}
          {!isOpen && <small>Registration is currently closed.</small>}
        </aside>

        <div className="tournament-rules">
          {sections.map(([title, body]) => (
            <section key={title} className="detail-block">
              <h3>{title}</h3>
              <ReadableCopy text={body || 'Contact the club for details.'} />
            </section>
          ))}
          {tournament.document && (
            <a className="text-link" href={tournament.document} target="_blank" rel="noreferrer">
              DOWNLOAD RULES <Download size={16} aria-hidden="true" />
            </a>
          )}
        </div>
      </section>
      {tournament.image && (
        <dialog ref={photoDialog} className="lightbox tournament-photo-dialog" aria-label="Tournament photo"
          onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
          <button type="button" aria-label="Close image" onClick={() => photoDialog.current?.close()}>
            <X aria-hidden="true" />
          </button>
          <AssetImage src={tournament.image} alt={tournament.title} loading="lazy" />
        </dialog>
      )}
    </>
  );
}
