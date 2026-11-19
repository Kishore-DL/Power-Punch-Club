import ReadableCopy from './readable-copy';
import { ArrowRight, ArrowUpRight, ChevronDown, Shield, Target, Zap } from 'lucide-react';
import { useId, useState } from 'react';

type TrainingProgram = {
  title: string;
  image?: string;
  description?: string;
  ages?: string;
  belt?: string;
  schedule?: string;
  venue?: string;
  fee?: number;
  feePeriod?: string;
};

type TrainingCardProps = {
  program: TrainingProgram;
  index: number;
  formatFee: (fee: number) => string;
  onTrial: () => void;
};

const programIcons = [Shield, Target, Zap];

export default function TrainingCard({ program, index, formatFee, onTrial }: TrainingCardProps) {
  const id = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const Icon = programIcons[index % programIcons.length];
  const fee = program.fee ?? 0;
  const feeLabel = program.feePeriod || 'Fee';
  const feeText = fee > 0 ? formatFee(fee) : 'Contact the club';

  return (
    <article className="program" data-details-open={detailsOpen}>
      <div className={'program-art art-' + index}>
        {program.image && <img className="program-photo" src={program.image} alt={program.title} loading="lazy" />}
        <span className="art-number" aria-hidden="true">0{index + 1}</span>
        <Icon aria-hidden="true" />
        <span className="belt-line" aria-hidden="true" />
      </div>
      <div className="program-body">
        <h3>{program.title}</h3>
        <ReadableCopy text={program.description} className="program-description desktop-label" />
        <div className="program-meta">
          <span>{program.ages}</span>
          <ArrowUpRight size={20} aria-hidden="true" />
          {fee > 0 && <span className="program-mobile-fee">{feeText} <small>{feeLabel}</small></span>}
        </div>
        <button type="button" className="text-link program-details-toggle"
          aria-expanded={detailsOpen} aria-controls={id + '-details'}
          onClick={() => setDetailsOpen(open => !open)}>
          Class details <ChevronDown size={15} aria-hidden="true" />
        </button>
        <div className="program-details" id={id + '-details'}>
          {program.description&&<ReadableCopy text={program.description} className="program-description mobile-label" />}
          <dl className="program-facts">
            <dt>Belt level</dt><dd>{program.belt}</dd>
            <dt>Timings</dt><dd>{program.schedule}</dd>
            <dt>Venue</dt><dd>{program.venue}</dd>
            <dt>{feeLabel}</dt><dd>{feeText}</dd>
          </dl>
        </div>
        <div className="program-actions">
          <button type="button" className="btn red" onClick={onTrial}>
            <span className="program-action-label">Book a trial class</span>
            <span className="program-action-short">Book trial</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
