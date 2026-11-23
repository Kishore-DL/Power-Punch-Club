import type {ClubContent,ClubEntry,LinkProps} from '../lib/club-types';
import type {ComponentType,ReactNode} from 'react';
import {preload} from 'react-dom';
import AssetImage from './asset-image';
import ReadableCopy from './readable-copy';
import { defaultClubLogo } from '../lib/defaults';
import { ArrowRight, ArrowUpRight, CalendarDays, Image as ImageIcon, MessageCircle, Target, Trophy } from 'lucide-react';
import TournamentCard from './tournament-card';

export default function ClubHome({ header, content, Link, program, formatFee, formatDate }: {header:ReactNode;content:ClubContent;Link:ComponentType<LinkProps>;program:(item:ClubEntry,index:number)=>ReactNode;formatFee:(fee:number)=>string;formatDate:(date:string)=>string}) {
  const { branding, tournaments, training, gallery, achievements, announcements } = content;
  const heroPhoto = !branding.hero || ['/dojo-rose.webp', '/dojo-portrait.webp'].includes(branding.hero)
    ? '/power-punch-banner.webp'
    : branding.hero;
  const heroBackdrop = branding.heroBackdrop === '/hero-purple-background.webp'
    ? '/hero-purple-background.webp?v=3'
    : branding.heroBackdrop;
  const isClubBanner = heroPhoto === '/power-punch-banner.webp';
  const foreground = isClubBanner ? '/karate-cutout.webp?v=2' : heroPhoto;
  const foregroundSources = isClubBanner ? '/karate-cutout-mobile.webp?v=2 480w, /karate-cutout.webp?v=2 861w' : undefined;
  const foregroundSizes = isClubBanner ? '(max-width: 800px) 49vw, 460px' : undefined;
  // Discover the selected responsive foreground in the initial HTML, not after
  // the backdrop/logo. Match the picture candidates so only one file is fetched.
  preload(foreground,{as:'image',imageSrcSet:foregroundSources,imageSizes:foregroundSizes,fetchPriority:'high'});
  const listedEvents = tournaments.filter((event) => event.status !== 'draft');
  const event = listedEvents.find(item=>item.presentationOnly&&item.status==='open') || listedEvents.find((item) => item.status === 'open') || listedEvents[0];
  const eventPath = event ? '/tournaments/' + event.id : '/tournaments';
  const photos = [...gallery.filter((item) => item.featured), ...gallery.filter((item) => !item.featured)]
    .filter((item) => item.type === 'photo').slice(0, 3);

  const shortcuts = [
    { title: 'Tournament registration', shortTitle: event?.status === 'open' ? 'Register' : 'Tournaments', hint: 'Dates, fees and registration', href: eventPath, icon: Trophy },
    { title: 'Karate classes', shortTitle: 'Classes', hint: 'Age groups, timings and fees', href: '/training', icon: Target },
    { title: 'Contact the club', shortTitle: 'Contact', hint: 'Phone, address and enquiries', href: '/contact', icon: MessageCircle },
  ];

  return (
    <div className="new-home">
      {header}
      <section className="campaign-hero wrap">
        {branding.heroBackdropMode === 'photo' && heroBackdrop && (
          <AssetImage className="campaign-backdrop" src={heroBackdrop} alt="" decoding="async" />
        )}
        <div className="campaign-copy">
          <AssetImage className="campaign-logo" src={branding.logo || defaultClubLogo} alt="" width={112} height={112} />
          <h1>{isClubBanner ? branding.name || 'Power Punch Club' : branding.heroTitle || branding.name}</h1>
          {!isClubBanner && branding.heroText && <p>{branding.heroText}</p>}
          <div className="campaign-actions">
            <Link to="/training" className="btn red">View Classes <ArrowUpRight size={16} aria-hidden="true"/></Link>
            <Link to={eventPath} className="btn outline-btn">
              <span className="desktop-label">{event?.status === 'open' ? 'Register for Tournament' : 'View Tournaments'}</span>
              <span className="mobile-label">{event?.status === 'open' ? 'Register' : 'Tournaments'}</span>
            </Link>
          </div>
        </div>
        <AssetImage className={isClubBanner ? "campaign-art campaign-art-cutout" : "campaign-art"} src={foreground}
          srcSet={foregroundSources} sizes={foregroundSizes}
          width={isClubBanner ? 861 : undefined} height={isClubBanner ? 1099 : undefined}
          alt="" fetchPriority="high" style={!isClubBanner ? { objectPosition: branding.heroPosition } : undefined} />
      </section>

      <nav className="task-links wrap" aria-label="Popular actions">
        {shortcuts.map(({ title, shortTitle, hint, href, icon: Icon }) => (
          <Link key={title} to={href} className="task-link">
            <span className="task-icon"><Icon size={22}/></span>
            <span className="task-link-copy">
              <strong className="desktop-label">{title}</strong>
              <strong className="mobile-label">{shortTitle}</strong>
              <small>{hint}</small>
            </span>
            <ArrowUpRight size={17} className="task-arrow"/>
          </Link>
        ))}
      </nav>

      <section className="wrap section">
        <div className="section-head">
          <h2>Tournaments</h2>
          <Link to="/tournaments" className="text-link">All tournaments <ArrowRight size={17}/></Link>
        </div>
        {event ? (
          <TournamentCard tournament={event} Link={Link} formatDate={formatDate} formatFee={formatFee} featured />
        ) : <div className="empty"><h3>No tournaments listed</h3><p>Dates and registration details will appear here.</p></div>}
      </section>

      <section className="training-band">
        <div className="wrap section">
          <div className="section-head">
            <h2>Karate classes</h2>
            <Link to="/training" className="text-link">All classes <ArrowRight size={17}/></Link>
          </div>
          {training.length ? <div className="grid three training-grid">{training.map(program)}</div>
            : <div className="empty"><h3>Class details coming soon</h3><Link to="/contact" className="text-link">Contact the club <ArrowRight size={17}/></Link></div>}
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2>Gallery</h2>
          <Link to="/gallery" className="text-link">
            <span className="desktop-label">All photos and videos</span>
            <span className="mobile-label">View gallery</span>
            <ArrowRight size={17} aria-hidden="true"/>
          </Link>
        </div>
        {photos.some((photo: {album?:string})=>photo.album==='Karate worldwide')&&<p className="gallery-source-note">Karate worldwide: photographs from other dojos and competitions.</p>}
        {photos.length ? <div className="home-photo-grid">
          {photos.map((photo) => <Link key={photo.id} to="/gallery" className="home-photo">
            <AssetImage src={photo.url} alt={photo.alt||photo.title} width={photo.width} height={photo.height} loading="lazy" decoding="async"/><span>{photo.title}<ArrowUpRight size={16}/></span>
          </Link>)}
        </div> : <div className="empty"><ImageIcon size={24}/><p>No photos added yet.</p></div>}
      </section>

      <section className="wrap home-secondary">
        <div className="home-secondary-card">
          <h2>Achievements</h2>
          {achievements.length ? <ul>{achievements.slice(0, 3).map((item) => <li key={item.id}><Trophy size={17}/><div><strong>{item.title}</strong><small>{item.student}</small></div></li>)}</ul>
            : <p>No achievements listed yet.</p>}
          <Link to="/achievements" className="text-link">All achievements <ArrowRight size={17}/></Link>
        </div>
        <div className="home-secondary-card">
          <h2>Announcements</h2>
          {branding.announcement && <ReadableCopy text={branding.announcement} className="announcement-copy" />}
          {announcements.length ? <ul>{announcements.slice(0, 3).map((item) => <li key={item.id}><CalendarDays size={17}/><div><strong>{item.title}</strong><small>{formatDate(item.date||'')}</small></div></li>)}</ul>
            : <p>No announcements yet.</p>}
          <Link to="/calendar" className="text-link">Event calendar <ArrowRight size={17}/></Link>
        </div>
      </section>
    </div>
  );
}
