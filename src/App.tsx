import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, Globe2, Heart, Info, Maximize2, Radio, RefreshCw, Search, Share2, SlidersHorizontal, Tv, X } from 'lucide-react';
import TVPlayer from './components/TVPlayer';
import { categoryName, countryFlag, countryName, loadCatalog, normalizeSearch, refreshCatalog, PLAYLIST_URL } from './lib/catalog';
import type { Catalog, Channel } from './lib/types';

type View = 'all' | 'favorites';
const featuredIds = ['France24.fr@French', 'TV5MONDEChefs.fr', 'DW.de@English', 'EuronewsFrench.fr', 'BFMTV.fr', 'AlJazeera.qa@English', 'TV5MondeEurope.fr', 'arte.fr', 'BBCNews.uk@UK'];
const themes = ['News', 'General', 'Movies', 'Music', 'Sports', 'Documentary', 'Kids'];
function readSaved(key: string): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []; } catch { return []; }
}
function Logo({ channel, className = '' }: { channel: Channel; className?: string }) {
  const [failedLogo, setFailedLogo] = useState('');
  return <span className={`channel-logo ${className}`}>{channel.logo && channel.logo !== failedLogo ? <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedLogo(channel.logo)} /> : <span>{channel.name.slice(0, 2).toUpperCase()}</span>}</span>;
}
function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.search).get('chaine') || '');
  const [favorites, setFavorites] = useState(() => readSaved('frequence:favorites'));
  const [recent, setRecent] = useState(() => readSaved('frequence:recent'));
  const [view, setView] = useState<View>('all');
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [visibleCount, setVisibleCount] = useState(60);
  const [cinema, setCinema] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [about, setAbout] = useState(false);
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const infoRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const refreshVersion = useRef(0);

  const boot = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const version = ++refreshVersion.current;
    setLoadError('');
    try {
      const snapshot = await loadCatalog(controller.signal);
      if (controller.signal.aborted) return;
      setCatalog(snapshot);
      // Keep the screen usable while the source catalog updates in the background.
      void refreshCatalog(snapshot, controller.signal).then(fresh => { if (!controller.signal.aborted && version === refreshVersion.current) setCatalog(fresh); }).catch(() => {});
    } catch {
      if (!controller.signal.aborted) setLoadError('Le catalogue ne répond pas. Vérifiez votre connexion puis réessayez.');
    }
  }, []);
  useEffect(() => { void boot(); return () => requestRef.current?.abort(); }, [boot]);
  useEffect(() => { try { localStorage.setItem('frequence:favorites', JSON.stringify(favorites)); } catch { /* Private browsing can disable storage. */ } }, [favorites]);
  useEffect(() => { try { localStorage.setItem('frequence:recent', JSON.stringify(recent)); } catch { /* Session remains usable. */ } }, [recent]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (about) infoRef.current?.showModal(); else infoRef.current?.close(); }, [about]);
  useEffect(() => {
    const update = () => setSelectedId(new URLSearchParams(location.search).get('chaine') || '');
    addEventListener('popstate', update); return () => removeEventListener('popstate', update);
  }, []);

  const channels = useMemo(() => catalog?.channels ?? [], [catalog]);
  const channelMap = useMemo(() => new Map(channels.map(channel => [channel.id, channel])), [channels]);
  const selected = channelMap.get(selectedId) || channels.find(c => c.id === 'France24.fr@French') || channels.find(c => c.country.toUpperCase() === 'FR' && c.streams.some(s => s.url.startsWith('https://'))) || channels[0] || null;
  const countryOptions = useMemo(() => [...new Set(channels.map(c => c.country).filter(Boolean))].sort((a, b) => countryName(a).localeCompare(countryName(b), 'fr')), [channels]);
  const categoryOptions = useMemo(() => [...new Set(channels.flatMap(c => c.categories))].sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'fr')), [channels]);
  const ordered = useMemo(() => {
    const ranks = new Map(featuredIds.map((id, i) => [id, i]));
    return [...channels].sort((a, b) => (ranks.get(a.id) ?? 100) - (ranks.get(b.id) ?? 100) || (a.country.toUpperCase() === 'FR' ? 0 : 1) - (b.country.toUpperCase() === 'FR' ? 0 : 1) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
  }, [channels]);
  const normalized = normalizeSearch(search);
  const filtered = useMemo(() => ordered.filter(channel =>
    (view !== 'favorites' || favorites.includes(channel.id)) && (!country || channel.country === country) && (!category || channel.categories.includes(category)) && (!normalized || normalizeSearch(`${channel.name} ${countryName(channel.country)} ${channel.languages.join(' ')} ${channel.categories.map(categoryName).join(' ')}`).includes(normalized))
  ), [ordered, view, favorites, country, category, normalized]);
  const recommendations = useMemo(() => {
    const past = recent.map(id => channelMap.get(id)).filter((c): c is Channel => Boolean(c));
    return [...past, ...ordered.filter(c => !recent.includes(c.id))].filter(c => c.id !== selected?.id).slice(0, 6);
  }, [ordered, recent, channelMap, selected?.id]);
  const toggleFavorite = (id: string) => setFavorites(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const select = useCallback((channel: Channel) => {
    setSelectedId(channel.id);
    setRecent(current => [channel.id, ...current.filter(id => id !== channel.id)].slice(0, 12));
    const url = new URL(location.href); url.searchParams.set('chaine', channel.id); history.pushState(null, '', url);
  }, []);
  const zap = useCallback((direction: number) => {
    const list = filtered.length ? filtered : ordered;
    if (!list.length) return;
    const index = list.findIndex(c => c.id === selected?.id);
    const nextIndex = index < 0 ? (direction > 0 ? 0 : list.length - 1) : (index + direction + list.length) % list.length;
    select(list[nextIndex]);
  }, [filtered, ordered, selected?.id, select]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey || event.metaKey || event.ctrlKey || about || (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|SELECT|TEXTAREA|BUTTON|VIDEO/.test(event.target.tagName)))) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); zap(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); zap(-1); }
      if (event.key === 'Escape') setCinema(false);
    };
    addEventListener('keydown', keyboard); return () => removeEventListener('keydown', keyboard);
  }, [zap, about]);
  useEffect(() => { setVisibleCount(60); }, [search, country, category, view]);
  const openChannel = (channel: Channel) => { select(channel); document.getElementById('television')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); };
  const share = async () => {
    if (!selected) return;
    const url = new URL(location.pathname, location.origin); url.searchParams.set('chaine', selected.id);
    try { await navigator.clipboard.writeText(url.href); setToast('Lien de la chaîne copié'); } catch { setToast('Le lien de cette chaîne se trouve dans la barre d’adresse.'); history.replaceState(null, '', url); }
  };
  const refresh = async () => {
    if (refreshing) return;
    const version = ++refreshVersion.current;
    setRefreshing(true);
    try { const fresh = await refreshCatalog(catalog ?? undefined); if (version === refreshVersion.current) setCatalog(fresh); setToast('Catalogue mis à jour'); } catch { setToast('Mise à jour indisponible. Votre catalogue reste accessible.'); } finally { setRefreshing(false); }
  };
  const clearFilters = () => { setSearch(''); setCountry(''); setCategory(''); setView('all'); };

  return <div className={`app ${cinema ? 'cinema' : ''}`}>
    <a className="skip-link" href="#catalogue">Aller aux chaînes</a>
    <header className="header">
      <a className="brand" href="/" aria-label="Fréquence, accueil"><span className="brand-mark"><i/><i/><i/></span><span>fréquence<span className="brand-dot">.</span></span></a>
      <nav className="main-nav" aria-label="Navigation principale">
        <button className={view === 'all' ? 'active' : ''} onClick={() => { setView('all'); document.getElementById('television')?.scrollIntoView({ behavior: 'smooth' }); }}><Tv size={17}/> <span>Télévision</span></button>
        <button className={view === 'favorites' ? 'active' : ''} onClick={() => { setView('favorites'); document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth' }); }}><Heart size={17}/> <span>Mes favoris</span>{favorites.length > 0 && <b>{favorites.length}</b>}</button>
      </nav>
      <div className="header-end"><span className="world-note"><Globe2 size={15}/> La télé, sans frontières.</span><button className="icon-button" aria-label="À propos de Fréquence" onClick={() => setAbout(true)}><Info size={19}/></button></div>
    </header>

    <main>
      <section id="television" className="television-section" aria-labelledby="welcome-heading">
        <div className="section-intro"><div><div className="live-label"><span/> Votre fenêtre sur le monde</div><h1 id="welcome-heading">Installez-vous. <span>Vous êtes à l’antenne.</span></h1></div><button className={`text-button cinema-button ${cinema ? 'is-active' : ''}`} onClick={() => setCinema(!cinema)}><Maximize2 size={16}/>{cinema ? 'Quitter le mode cinéma' : 'Mode cinéma'}</button></div>
        <div className="watch-layout">
          <div className="screen-column">
            <TVPlayer channel={selected} onNext={() => zap(1)} onPrevious={() => zap(-1)} onPlaying={setPlaying}/>
            <div className="now-playing">
              {selected ? <><Logo channel={selected}/><div className="now-text"><div className="now-name"><h2>{selected.name}</h2><span className={`status-tag ${playing ? 'is-live' : ''}`}>{playing ? <><i/> En direct</> : 'À regarder'}</span></div><p>{countryFlag(selected.country)} {countryName(selected.country)}<span className="metadata-divider"/>{selected.categories.map(categoryName).join(', ') || 'Télévision'}{selected.streams.length > 1 && <><span className="metadata-divider"/>{selected.streams.length} sources</>}</p></div><div className="now-actions"><button className={`icon-button ${favorites.includes(selected.id) ? 'saved' : ''}`} aria-label={favorites.includes(selected.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={favorites.includes(selected.id)} onClick={() => toggleFavorite(selected.id)}><Heart size={20} fill={favorites.includes(selected.id) ? 'currentColor' : 'none'}/></button><button className="icon-button" onClick={() => void share()} aria-label="Partager cette chaîne"><Share2 size={19}/></button></div></> : <p>{loadError ? 'Catalogue indisponible' : 'Chargement des chaînes…'}</p>}
            </div>
          </div>
          <aside className="discovery" aria-label="Chaînes à découvrir"><div className="discovery-title"><h2>Un peu de zapping ?</h2><Radio size={18}/></div><p className="discovery-subtitle">Une autre chaîne, un autre regard.</p><div className="discovery-list">{recommendations.map(channel => <button key={channel.id} className="station-row" onClick={() => select(channel)}><Logo channel={channel}/><span className="station-description"><strong>{channel.name}</strong><span>{countryFlag(channel.country)} {countryName(channel.country)}</span></span><span className="station-play"><ArrowRight size={17}/></span></button>)}{!catalog && Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton station-skeleton"/>)}</div><a className="browse-link" href="#catalogue">Explorer toutes les chaînes <ArrowDown size={17}/></a><div className="keyboard-note"><span><kbd>←</kbd><kbd>→</kbd></span> pour changer de chaîne</div></aside>
        </div>
      </section>

      <section id="catalogue" className="catalog-section" aria-labelledby="catalog-heading">
        <div className="catalog-heading"><div><h2 id="catalog-heading">{view === 'favorites' ? 'Vos incontournables.' : 'Le monde est au programme.'}</h2><p>{view === 'favorites' ? 'Les chaînes que vous aimez, au même endroit.' : <>Des chaînes d’ici et d’ailleurs. À vous de choisir.</>}</p></div><span className="catalog-total"><span className="small-orbit"><Globe2 size={19}/></span><strong>{channels.length.toLocaleString('fr-FR')}</strong> chaînes</span></div>
        <div className="catalog-toolbar"><div className="search-box"><Search size={19}/><input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher une chaîne, un pays…" aria-label="Rechercher une chaîne"/><kbd>/</kbd></div><div className="filter-select"><Globe2 size={17}/><select aria-label="Filtrer par pays" value={country} onChange={event => setCountry(event.target.value)}><option value="">Tous les pays</option>{countryOptions.map(code => <option key={code} value={code}>{countryFlag(code)} {countryName(code)}</option>)}</select><ChevronDown size={15}/></div><div className="filter-select category-select"><SlidersHorizontal size={17}/><select aria-label="Filtrer par catégorie" value={category} onChange={event => setCategory(event.target.value)}><option value="">Toutes les catégories</option>{categoryOptions.map(item => <option key={item} value={item}>{categoryName(item)}</option>)}</select><ChevronDown size={15}/></div></div>
        <div className="category-row" aria-label="Catégories populaires"><button className={!category && view === 'all' ? 'chosen' : ''} onClick={() => { setCategory(''); setView('all'); }}><Globe2 size={15}/>Tout explorer</button><button className={view === 'favorites' ? 'chosen' : ''} onClick={() => setView(view === 'favorites' ? 'all' : 'favorites')}><Heart size={15}/>Favoris</button><span className="chip-divider"/>{themes.map(theme => <button key={theme} className={category === theme ? 'chosen' : ''} onClick={() => setCategory(category === theme ? '' : theme)}>{categoryName(theme)}</button>)}</div>
        <div className="results-bar"><span role="status">{catalog ? `${filtered.length.toLocaleString('fr-FR')} chaîne${filtered.length !== 1 ? 's' : ''}${search || country || category || view === 'favorites' ? ' trouvée' + (filtered.length !== 1 ? 's' : '') : ' à explorer'}` : 'Préparation du catalogue…'}</span>{(search || country || category || view !== 'all') && <button className="reset-button" onClick={clearFilters}>Effacer les filtres <X size={13}/></button>}<button className="refresh-button" onClick={() => void refresh()} disabled={refreshing || !catalog} aria-label="Actualiser le catalogue"><RefreshCw size={14} className={refreshing ? 'spin' : ''}/><span>{refreshing ? 'Actualisation…' : 'Actualiser'}</span></button></div>
        {loadError && <div className="empty-state"><Radio size={32}/><h3>La réception attendra un instant.</h3><p>{loadError}</p><button className="primary-button" onClick={() => void boot()}>Réessayer</button></div>}
        {!catalog && !loadError && <div className="channel-grid">{Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton card-skeleton"/>)}</div>}
        {catalog && filtered.length === 0 && <div className="empty-state">{view === 'favorites' ? <Heart size={34}/> : <Search size={34}/>}<h3>{view === 'favorites' && !favorites.length ? 'Votre sélection commence ici.' : 'Aucune chaîne sur cette fréquence.'}</h3><p>{view === 'favorites' && !favorites.length ? 'Touchez le cœur d’une chaîne pour la retrouver ici.' : 'Essayez un autre nom ou élargissez vos filtres.'}</p><button className="primary-button" onClick={clearFilters}>Explorer les chaînes</button></div>}
        <div className="channel-grid">{filtered.slice(0, visibleCount).map(channel => <article key={channel.id} className={`channel-card ${selected?.id === channel.id ? 'selected' : ''}`}><button className="channel-open" onClick={() => openChannel(channel)} aria-label={`Regarder ${channel.name}`}><div className="card-art"><Logo channel={channel}/>{selected?.id === channel.id ? <span className="current-channel"><Radio size={12}/> À l’écran</span> : <span className="card-country" title={countryName(channel.country)}>{countryFlag(channel.country)}</span>}<span className="card-play"><ArrowRight size={19}/></span></div><div className="card-description"><h3>{channel.name}</h3><p>{channel.categories.slice(0, 2).map(categoryName).join(' · ') || countryName(channel.country)}</p></div></button><button className={`card-favorite ${favorites.includes(channel.id) ? 'saved' : ''}`} onClick={() => toggleFavorite(channel.id)} aria-label={`${favorites.includes(channel.id) ? 'Retirer' : 'Ajouter'} ${channel.name} ${favorites.includes(channel.id) ? 'des' : 'aux'} favoris`} aria-pressed={favorites.includes(channel.id)}><Heart size={17} fill={favorites.includes(channel.id) ? 'currentColor' : 'none'}/></button></article>)}</div>
        {filtered.length > visibleCount && <div className="load-more"><button onClick={() => setVisibleCount(count => count + 60)}>Voir plus de chaînes <ChevronDown size={17}/></button><span>{Math.min(visibleCount, filtered.length)} sur {filtered.length.toLocaleString('fr-FR')}</span></div>}
      </section>
    </main>

    <footer><a className="brand footer-brand" href="/">fréquence<span className="brand-dot">.</span></a><p>Le monde, au bout de la télécommande.</p><div><a href={PLAYLIST_URL} target="_blank" rel="noreferrer">Catalogue IPTV-org</a><button onClick={() => setAbout(true)}>À propos & aide</button></div></footer>
    <dialog ref={infoRef} className="about-dialog" onCancel={() => setAbout(false)} onClick={event => { if (event.target === event.currentTarget) setAbout(false); }}><div className="dialog-heading"><span className="brand">fréquence<span className="brand-dot">.</span></span><button className="icon-button" aria-label="Fermer l’aide" onClick={() => setAbout(false)}><X size={21}/></button></div><h2>La télé, à votre rythme.</h2><p>Choisissez une chaîne, lancez la lecture et explorez le monde. Vos favoris restent enregistrés dans ce navigateur, sans compte.</p><div className="help-shortcuts"><span><kbd>←</kbd><kbd>→</kbd> Changer de chaîne</span><span><kbd>/</kbd> Rechercher</span></div><h3>Une chaîne ne se lance pas ?</h3><p>Essayez une autre source dans le lecteur. Certains flux sont hors ligne, limités à un pays ou incompatibles avec la lecture web. Vous pouvez copier leur adresse pour les ouvrir dans un lecteur comme VLC.</p><h3>Un catalogue ouvert</h3><p>Les chaînes proviennent de la <a href={PLAYLIST_URL} target="_blank" rel="noreferrer">playlist publique IPTV-org</a>. Fréquence ne stocke ni ne retransmet les vidéos : la lecture se fait directement auprès des diffuseurs.</p><p className="update-note">{catalog ? `Catalogue actualisé le ${new Date(catalog.updatedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}. ${catalog.streamCount.toLocaleString('fr-FR')} flux référencés.` : 'Chargement du catalogue.'}</p></dialog>
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}

export default App;
