import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, ChefHat, ChevronLeft, ChevronRight, Clapperboard, Compass, Globe2, Heart, Music2, Newspaper, Play, Sparkles, Trophy } from 'lucide-react';
import { categoryName, countryFlag, countryName } from '../lib/catalog';
import { DISCOVERY_CATEGORIES, getCategoryChannels, getRecentChannels, getTrendingChannels } from '../lib/discovery';
import type { Channel } from '../lib/types';
import './HomePage.css';

interface HomePageProps {
  channels: Channel[];
  favorites: string[];
  recent: string[];
  onWatch: (channel: Channel) => void;
  onExplore: (category?: string, country?: string) => void;
  onFavorite: (id: string) => void;
  onFavorites: () => void;
}

const themeIcons = { News: Newspaper, Movies: Clapperboard, Music: Music2, Sports: Trophy, Cooking: ChefHat, Documentary: Compass, Kids: Sparkles };
const countries = ['FR', 'UK', 'US', 'ES', 'DE', 'IT'];
const darkLogoCards: Record<string, string> = { 'QwestTV.fr': 'qwest', 'WaterBear.ch': 'waterbear', 'SonyOneHitsAction.fr': 'sony' };

function ChannelLogo({ channel, priority = false }: { channel: Channel; priority?: boolean }) {
  const [failed, setFailed] = useState('');
  return <span className="home-channel-logo">
    {channel.logo && failed !== channel.logo
      ? <img src={channel.logo} alt="" loading={priority ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setFailed(channel.logo)} />
      : <span className="home-logo-fallback">{channel.name}</span>}
  </span>;
}

function ScrollRail({ title, subtitle, action, actionLabel, children, count }: {
  title: string; subtitle?: string; action?: () => void; actionLabel?: string; children: ReactNode; count: number;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const id = useId();
  const [position, setPosition] = useState({ overflow: false, start: true, end: false });
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const measure = () => setPosition({
      overflow: element.scrollWidth > element.clientWidth + 2,
      start: element.scrollLeft <= 2,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
    });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => { observer.disconnect(); element.removeEventListener('scroll', measure); };
  }, [count]);
  const scroll = (direction: number) => {
    const element = rail.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * .85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <section className="home-section" aria-labelledby={`${id}-title`}>
    <div className="home-section-heading">
      <div className="home-heading-copy"><h2 id={`${id}-title`}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <div className="home-section-actions">
        {action && <button className="home-text-link" onClick={action}>{actionLabel || 'Tout explorer'}<ArrowRight size={15} aria-hidden="true" /></button>}
        {position.overflow && <div className="home-rail-controls">
          <button onClick={() => scroll(-1)} disabled={position.start} aria-label={`Faire défiler ${title} vers la gauche`} aria-controls={id}><ChevronLeft size={17} aria-hidden="true" /></button>
          <button onClick={() => scroll(1)} disabled={position.end} aria-label={`Faire défiler ${title} vers la droite`} aria-controls={id}><ChevronRight size={17} aria-hidden="true" /></button>
        </div>}
      </div>
    </div>
    <div className="home-channel-rail" id={id} ref={rail}>{children}</div>
  </section>;
}

function ChannelCard({ channel, favorite, onWatch, onFavorite, index }: {
  channel: Channel; favorite: boolean; onWatch: (channel: Channel) => void; onFavorite: (id: string) => void; index: number;
}) {
  return <article className={`home-channel-card home-card-tone-${index % 6}${darkLogoCards[channel.id] ? ` home-brand-${darkLogoCards[channel.id]}` : ''}`}>
    <button className="home-channel-open" onClick={() => onWatch(channel)} aria-label={`Regarder ${channel.name}`}>
      <span className="home-card-art">
        <span className="home-card-category">{categoryName(channel.categories[0] || 'General')}</span>
        <ChannelLogo channel={channel} />
        <span className="home-card-play"><Play size={15} fill="currentColor" aria-hidden="true" /></span>
      </span>
      <span className="home-card-caption"><strong>{channel.name}</strong><span>{countryName(channel.country)}</span></span>
    </button>
    <button className={`home-card-favorite${favorite ? ' is-saved' : ''}`} onClick={() => onFavorite(channel.id)} aria-pressed={favorite} aria-label={`${favorite ? 'Retirer' : 'Ajouter'} ${channel.name} ${favorite ? 'des' : 'aux'} favoris`} title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" /></button>
  </article>;
}

export default function HomePage({ channels, favorites, recent, onWatch, onExplore, onFavorite, onFavorites }: HomePageProps) {
  const heroChannel = channels.find(channel => channel.id === 'France24.fr@French');
  const cookingChannel = channels.find(channel => channel.id === 'TV5MONDEChefs.fr');
  const trending = useMemo(() => getTrendingChannels(channels), [channels]);
  const history = useMemo(() => getRecentChannels(channels, recent).slice(0, 10), [channels, recent]);
  const saved = useMemo(() => getRecentChannels(channels, favorites).slice(0, 10), [channels, favorites]);
  const themeCounts = useMemo(() => Object.fromEntries(DISCOVERY_CATEGORIES.map(theme => [theme.id, getCategoryChannels(channels, theme.id, channels.length).length])), [channels]);
  const countryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    channels.forEach(channel => {
      const code = channel.country.toUpperCase();
      if (code) counts.set(code, (counts.get(code) || 0) + 1);
    });
    return counts;
  }, [channels]);
  const renderCards = (list: Channel[]) => list.map((channel, index) => <ChannelCard key={channel.id} channel={channel} favorite={favorites.includes(channel.id)} onWatch={onWatch} onFavorite={onFavorite} index={index} />);

  return <div className="home-page">
    <div className="home-hero-grid">
      <section className="home-hero" aria-labelledby="home-title">
        <img className="home-hero-image" src="/images/city.jpg" alt="" fetchPriority="high" />
        <div className="home-hero-shade" />
        <div className="home-hero-brand">
          {heroChannel && <ChannelLogo channel={heroChannel} priority />}
          <span>France 24<small>Le regard international</small></span>
        </div>
        <div className="home-hero-copy">
          <h1 id="home-title">Le monde<br />n’attend pas.</h1>
          <p>L’actualité internationale, en français et en continu.</p>
          <div className="home-hero-actions">
            <button className="home-primary-button" disabled={!heroChannel} onClick={() => heroChannel && onWatch(heroChannel)}><Play size={17} fill="currentColor" aria-hidden="true" />Regarder France 24</button>
            <button className="home-hero-explore" onClick={() => onExplore()}>Explorer toutes les chaînes<ArrowRight size={16} aria-hidden="true" /></button>
          </div>
        </div>
        <span className="home-hero-corner">À la une sur Fréquence</span>
      </section>
      <section className="home-cooking" aria-labelledby="home-cooking-title">
        <img src="/images/cooking.jpg" className="home-cooking-image" alt="" />
        <div className="home-cooking-shade" />
        <span className="home-feature-tag"><ChefHat size={15} aria-hidden="true" />Le goût de découvrir</span>
        <div className="home-cooking-copy">
          <h2 id="home-cooking-title">Passez <br />à table.</h2>
          <p>Une invitation en cuisine<br />avec TV5MONDE Chefs.</p>
          <button className="home-cooking-watch" disabled={!cookingChannel} onClick={() => cookingChannel && onWatch(cookingChannel)} aria-label="Regarder TV5MONDE Chefs"><span className="home-round-play"><Play size={15} fill="currentColor" aria-hidden="true" /></span>Regarder la chaîne<ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </section>
    </div>

    <ScrollRail title="Tendances à découvrir" subtitle="La sélection Fréquence" action={() => onExplore()} count={trending.length}>
      {trending.length ? renderCards(trending) : Array.from({ length: 6 }, (_, index) => <div key={index} className="home-channel-placeholder" aria-hidden="true"><span /><i /><i /></div>)}
    </ScrollRail>

    <section className="home-section home-themes" aria-labelledby="home-themes-title">
      <div className="home-section-heading"><div className="home-heading-copy"><h2 id="home-themes-title">À chaque envie, ses chaînes</h2></div><span className="home-section-note">Suivez votre curiosité</span></div>
      <div className="home-theme-grid">
        {DISCOVERY_CATEGORIES.map(theme => {
          const Icon = themeIcons[theme.id as keyof typeof themeIcons] || Compass;
          const count = themeCounts[theme.id] || 0;
          const label = theme.id === 'News' ? 'Actu' : theme.label;
          return <button className={`home-theme home-theme-${theme.id.toLowerCase()}`} key={theme.id} onClick={() => onExplore(theme.id)} aria-label={`Explorer ${label}, ${count} chaînes`}>
            <span className="home-theme-top"><Icon size={25} strokeWidth={1.6} aria-hidden="true" /><ArrowRight size={15} aria-hidden="true" /></span>
            <strong>{label}</strong><span className="home-theme-count">{count.toLocaleString('fr-FR')} chaînes</span>
          </button>;
        })}
      </div>
    </section>

    {history.length > 0 && <ScrollRail title="Vos derniers rendez-vous" subtitle="Vos dernières chaînes explorées" count={history.length}>{renderCards(history)}</ScrollRail>}
    {saved.length > 0 && <ScrollRail title="Toujours vos préférées" subtitle="Votre sélection, juste ici" action={onFavorites} actionLabel="Tous mes favoris" count={saved.length}>{renderCards(saved)}</ScrollRail>}

    <section className="home-world-section" aria-label="Découvrir d’autres horizons">
      <div className="home-world">
        <span className="home-world-icon"><Globe2 size={23} strokeWidth={1.5} aria-hidden="true" /></span>
        <h2>Zappez sans frontières.</h2>
        <p>Un pays, un autre regard. La télé vous emmène ailleurs.</p>
        <div className="home-country-grid">
          {countries.filter(code => countryCounts.has(code)).map(code => <button key={code} className="home-country" onClick={() => onExplore(undefined, code)} aria-label={`Explorer les chaînes : ${countryName(code)}`}><span className="home-country-flag" aria-hidden="true">{countryFlag(code)}</span><span><strong>{countryName(code)}</strong><small>{countryCounts.get(code)?.toLocaleString('fr-FR')} chaînes</small></span><ChevronRight size={15} aria-hidden="true" /></button>)}
        </div>
      </div>
      <div className="home-nature">
        <img src="/images/nature.jpg" alt="" loading="lazy" />
        <div className="home-nature-shade" />
        <div className="home-nature-copy"><span>Documentaires & découvertes</span><h2>Ailleurs<br />commence ici.</h2><button onClick={() => onExplore('Documentary')}>Partir à la découverte<ArrowRight size={17} aria-hidden="true" /></button></div>
      </div>
    </section>
  </div>;
}
