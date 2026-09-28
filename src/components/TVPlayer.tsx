import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Copy, Download, LoaderCircle, Maximize, Pause, PictureInPicture2, Play, Radio, RotateCcw, SkipBack, SkipForward, Tv, WifiOff } from 'lucide-react';
import type Hls from 'hls.js';
import type { ErrorEvent as DashErrorEvent, MediaPlayerClass } from 'dashjs';
import type { Channel } from '../lib/types';
import { isDashStream, isDirectVideo, isWebStream, preferredStreamIndex, streamProblem } from '../lib/playback';
import { createPlaybackRound, SOURCE_TIMEOUT_MS, transitionFailure } from '../lib/failover';
import type { PlaybackFailure } from '../lib/failover';
import { createChannelPlaylist, getChannelDestination, playlistFilename } from '../lib/recovery-links';
import './TVPlayer.css';

type Status = 'idle' | 'loading' | 'playing' | 'buffering' | 'paused' | 'ended' | 'error';
type PlayerState = { key: string; status: Status; sourceIndex: number; attempted: number; total: number; error?: string };
type Props = {
  channel: Channel | null;
  onNext: () => void;
  onPrevious: () => void;
  onPlaying?: (playing: boolean) => void;
  onRefreshSources?: () => Promise<void>;
  enabled?: boolean;
  playRequest?: number;
};

const statusLabels: Record<Status, string> = {
  idle: 'Prêt à regarder', loading: 'Connexion au direct…', playing: 'En direct',
  buffering: 'Mise en mémoire tampon…', paused: 'En pause', ended: 'Diffusion terminée', error: 'Source indisponible',
};
const unavailableMessage = 'Le diffuseur peut être indisponible ou limiter l’accès au direct. Essayez son site ou ouvrez la chaîne dans VLC.';

export default function TVPlayer({ channel, onNext, onPrevious, onPlaying, onRefreshSources, enabled = true, playRequest = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const interactedRef = useRef(false);
  const playbackIntentRef = useRef({ channelId: '', paused: false });
  const handledPlayRequest = useRef(0);
  const onPlayingRef = useRef(onPlaying);
  const resumeRef = useRef<(() => void) | null>(null);
  const [sourceChoice, setSourceChoice] = useState({ channelId: '', index: 0 });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlayerState>({ key: '', status: 'idle', sourceIndex: 0, attempted: 0, total: 0 });
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState('');
  const [brokenLogo, setBrokenLogo] = useState('');
  const selectedIndex = sourceChoice.channelId === channel?.id && channel?.streams[sourceChoice.index]
    ? sourceChoice.index : preferredStreamIndex(channel?.streams ?? []);
  const channelId = channel?.id;
  // Stream URLs belong to the round identity, so refreshed catalogs invalidate old work.
  const streamSignature = JSON.stringify(channel?.streams.map(stream => stream.url) ?? []);
  const key = `${channelId ?? ''}:${streamSignature}:${selectedIndex}:${attempt}:${playRequest}:${enabled}`;
  const latestKeyRef = useRef(key);
  latestKeyRef.current = key;
  const sourceIndex = state.key === key ? state.sourceIndex : selectedIndex;
  const streamUrl = channel?.streams[sourceIndex]?.url;
  const status = state.key === key ? state.status : (enabled && interactedRef.current && channel ? 'loading' : 'idle');
  const error = state.key === key ? state.error : undefined;
  const busy = status === 'loading' || status === 'buffering';
  const showStart = status === 'idle' || status === 'ended';
  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled;
  const destination = channel ? getChannelDestination(channel) : undefined;
  const hasHttpSources = channel?.streams.some(stream => /^http:\/\//i.test(stream.url));
  const hasExternalSources = channel?.streams.some(stream => isWebStream(stream.url));

  useEffect(() => { onPlayingRef.current = onPlaying; }, [onPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // JSON signature contains strings to avoid reacting to unrelated metadata updates.
    const roundStreams = (JSON.parse(streamSignature) as string[]).map(url => ({ url }));
    let round = createPlaybackRound(roundStreams, selectedIndex);
    let disposed = false;
    let hls: Hls | null = null;
    let dash: MediaPlayerClass | null = null;
    let removeEvents = () => {};
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let sourceDeadline: number | undefined;
    let wantsPlayback = !(playbackIntentRef.current.channelId === channelId && playbackIntentRef.current.paused && playRequest <= handledPlayRequest.current);
    playbackIntentRef.current = { channelId: channelId ?? '', paused: !wantsPlayback };
    let fallbackAnnounced = false;
    let pendingFailure: { failure: PlaybackFailure; token: number } | undefined;
    let recoverMedia: (() => void) | undefined;
    const alive = (token: number) => !disposed && latestKeyRef.current === key && !round.stopped && token === round.token;
    const clearTimer = () => { if (timeout !== undefined) clearTimeout(timeout); timeout = undefined; };
    const update = (next: Status, message?: string) => {
      if (disposed || latestKeyRef.current !== key) return;
      setState({ key, status: next, error: message, sourceIndex: round.sources[round.position] ?? selectedIndex,
        attempted: interactedRef.current && round.sources.length ? round.position + 1 : 0, total: round.sources.length });
      onPlayingRef.current?.(next === 'playing');
    };
    const detach = () => {
      removeEvents();
      removeEvents = () => {};
      resumeRef.current = null;
      recoverMedia = undefined;
      hls?.destroy();
      hls = null;
      dash?.reset();
      dash = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
    const armTimer = (token: number) => {
      if (timeout !== undefined || !alive(token) || !wantsPlayback) return;
      sourceDeadline ??= Date.now() + SOURCE_TIMEOUT_MS;
      timeout = setTimeout(() => { timeout = undefined; failSource('timeout', token); }, Math.max(0, sourceDeadline - Date.now()));
    };
    const failSource = (failure: PlaybackFailure, token: number) => {
      if (!alive(token)) return;
      // A deliberate pause never starts a new source behind the user's back.
      if (!wantsPlayback) { pendingFailure = { failure, token }; return; }
      const result = transitionFailure(round, failure, token);
      round = result.round;
      if (result.action === 'ignore') return;
      clearTimer();
      if (result.action === 'recover-media' && recoverMedia) {
        update('buffering');
        armTimer(round.token);
        recoverMedia();
        return;
      }
      detach();
      if (result.action === 'stop') { update('error', unavailableMessage); return; }
      if (result.action === 'next') { sourceDeadline = undefined; fallbackAnnounced = false; }
      // Retry shares the original nine-second deadline; it cannot prolong a failed source.
      void attach(round.token);
    };
    const attach = async (token: number) => {
      if (!alive(token)) return;
      const url = roundStreams[round.sources[round.position]].url;
      let hasPlayEvent = false;
      let attachingMedia = false;
      let recoveringMedia = false;
      update(wantsPlayback ? 'loading' : 'paused');
      armTimer(token);
      const play = () => {
        if (!alive(token)) return;
        wantsPlayback = true;
        playbackIntentRef.current.paused = false;
        if (pendingFailure) {
          const failure = pendingFailure;
          pendingFailure = undefined;
          failSource(failure.failure, failure.token);
          return;
        }
        update('loading');
        armTimer(token);
        void video.play().catch((reason: unknown) => {
          if (!alive(token)) return;
          const name = reason instanceof DOMException || reason instanceof Error ? reason.name : '';
          if (name === 'AbortError') return;
          if (name === 'NotAllowedError') {
            wantsPlayback = false;
            playbackIntentRef.current.paused = true;
            clearTimer();
            sourceDeadline = undefined;
            update('paused');
            setNotice('Appuyez sur lecture pour continuer.');
          } else failSource('unavailable', token);
        });
      };
      resumeRef.current = play;
      const onPlay = () => {
        if (!alive(token) || video.paused) return;
        if (pendingFailure) { play(); return; }
        hasPlayEvent = true;
        wantsPlayback = true;
        playbackIntentRef.current.paused = false;
        update('loading');
        armTimer(token);
      };
      const onPlayingEvent = () => {
        if (!alive(token) || video.paused || video.readyState < 2) return;
        wantsPlayback = true;
        playbackIntentRef.current.paused = false;
        hasPlayEvent = true;
        clearTimer();
        sourceDeadline = undefined;
        update('playing');
        if (round.position > 0 && !fallbackAnnounced) {
          fallbackAnnounced = true;
          setNotice(`Le direct a repris avec une autre source (${round.position + 1} sur ${round.sources.length}).`);
        }
      };
      const onWaiting = () => {
        if (alive(token) && wantsPlayback && !video.paused) { update('buffering'); armTimer(token); }
      };
      const onStalled = () => { if (video.readyState < 3) onWaiting(); };
      const onPause = () => {
        // Ignore teardown/recovery pause events queued by the old media attachment.
        if (alive(token) && hasPlayEvent && !attachingMedia && video.paused && !video.ended && !video.error) {
          wantsPlayback = false;
          playbackIntentRef.current.paused = true;
          clearTimer();
          sourceDeadline = undefined;
          update('paused');
        }
      };
      const onEnded = () => {
        if (alive(token) && video.ended) { wantsPlayback = false; clearTimer(); sourceDeadline = undefined; update('ended'); }
      };
      const onError = () => {
        if (!alive(token) || !video.error || video.error.code === 1) return;
        // hls.js owns decoder recovery; its fatal error gives us the useful context.
        if (hls) return;
        failSource(video.error.code === 2 ? 'network' : 'unavailable', token);
      };
      const events: [keyof HTMLMediaElementEventMap, EventListener][] = [
        ['play', onPlay], ['playing', onPlayingEvent], ['waiting', onWaiting],
        ['stalled', onStalled], ['pause', onPause], ['ended', onEnded], ['error', onError],
      ];
      events.forEach(([name, handler]) => video.addEventListener(name, handler));
      removeEvents = () => events.forEach(([name, handler]) => video.removeEventListener(name, handler));
      try {
        if (isDashStream(url)) {
          const { MediaPlayer } = await import('dashjs');
          if (!alive(token)) return;
          dash = MediaPlayer().create();
          dash.updateSettings({ streaming: { manifestRequestTimeout: SOURCE_TIMEOUT_MS, fragmentRequestTimeout: SOURCE_TIMEOUT_MS,
            retryAttempts: { MPD: 0, MediaSegment: 0, InitializationSegment: 0, XLinkExpansion: 0, IndexSegment: 0, other: 0 } } });
          dash.on(MediaPlayer.events.STREAM_INITIALIZED, () => { if (alive(token) && wantsPlayback) play(); });
          dash.on(MediaPlayer.events.ERROR, (event: DashErrorEvent) => {
            if (!alive(token)) return;
            const code = event.error && typeof event.error === 'object' ? event.error.code : undefined;
            // Clock synchronization and subtitle errors do not make the video unusable.
            if (code === MediaPlayer.errors.TIME_SYNC_FAILED_ERROR_CODE || code === MediaPlayer.errors.TIMED_TEXT_ERROR_ID_PARSE_CODE) return;
            failSource('unavailable', token);
          });
          dash.initialize(video, url, false);
          return;
        }
        const nativeHls = video.canPlayType('application/vnd.apple.mpegurl');
        const safari = /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR|Android/i.test(navigator.userAgent);
        if (isDirectVideo(url) || (nativeHls && safari)) { video.src = url; if (wantsPlayback) play(); return; }
        const { default: HlsPlayer } = await import('hls.js');
        if (!alive(token)) return;
        if (!HlsPlayer.isSupported()) {
          if (nativeHls) { video.src = url; if (wantsPlayback) play(); }
          else failSource('unavailable', token);
          return;
        }
        const loadPolicy = { default: { maxTimeToFirstByteMs: SOURCE_TIMEOUT_MS, maxLoadTimeMs: SOURCE_TIMEOUT_MS, timeoutRetry: null, errorRetry: null } };
        hls = new HlsPlayer({ enableWorker: true, backBufferLength: 30,
          manifestLoadPolicy: loadPolicy, playlistLoadPolicy: loadPolicy, fragLoadPolicy: loadPolicy, keyLoadPolicy: loadPolicy });
        hls.on(HlsPlayer.Events.MEDIA_ATTACHING, () => { attachingMedia = true; });
        hls.on(HlsPlayer.Events.MEDIA_ATTACHED, () => {
          attachingMedia = false;
          if (recoveringMedia && alive(token) && wantsPlayback) { recoveringMedia = false; play(); }
        });
        recoverMedia = () => {
          hasPlayEvent = false;
          recoveringMedia = true;
          attachingMedia = true;
          hls?.recoverMediaError();
        };
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => { if (alive(token) && wantsPlayback) play(); });
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (!alive(token)) return;
          const code = data.response?.code;
          if (code && [401, 403, 404, 410].includes(code)) { failSource('unavailable', token); return; }
          if (!data.fatal) return;
          if (data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR) failSource('network', token);
          else if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR) failSource('media', token);
          else failSource('unavailable', token);
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } catch { failSource('unavailable', token); }
    };

    setNotice('');
    setCopied(false);
    if (!enabled) { interactedRef.current = false; playbackIntentRef.current.paused = false; update('idle'); }
    else {
      if (playRequest > handledPlayRequest.current) { interactedRef.current = true; handledPlayRequest.current = playRequest; }
      if (!channelId || !interactedRef.current) update('idle');
      else if (!round.sources.length) {
        const problem = streamProblem(roundStreams[selectedIndex]?.url, window.location.protocol);
        update('error', problem ?? 'Aucune source sécurisée ne peut être lue ici. Le lien reste disponible pour un lecteur externe.');
      } else void attach(round.token);
    }
    return () => {
      disposed = true;
      clearTimer();
      detach();
      onPlayingRef.current?.(false);
    };
  }, [key, channelId, streamSignature, selectedIndex, enabled, playRequest]);

  useEffect(() => {
    if (!notice && !copied) return;
    const timer = setTimeout(() => { setNotice(''); setCopied(false); }, 4500);
    return () => clearTimeout(timer);
  }, [notice, copied]);

  const start = () => {
    if (status === 'paused' && interactedRef.current) { resumeRef.current?.(); return; }
    interactedRef.current = true;
    playbackIntentRef.current.paused = false;
    setAttempt(value => value + 1);
  };
  const refreshSources = async () => {
    if (!onRefreshSources || refreshing === key) return;
    const requestedKey = key;
    setRefreshing(requestedKey);
    try {
      await onRefreshSources();
      if (latestKeyRef.current === requestedKey) {
        interactedRef.current = true;
        setAttempt(value => value + 1);
      }
    } catch (reason: unknown) {
      if (latestKeyRef.current === requestedKey) setNotice(reason instanceof Error ? reason.message : 'L’actualisation est indisponible pour le moment. Réessayez dans un instant.');
    } finally { setRefreshing(value => value === requestedKey ? '' : value); }
  };
  const downloadPlaylist = () => {
    if (!channel) return;
    const blob = new Blob([createChannelPlaylist(channel)], { type: 'audio/x-mpegurl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = playlistFilename(channel);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Ouvrez le fichier téléchargé avec VLC ou un autre lecteur compatible.');
  };

  const copyStream = async () => {
    if (!streamUrl || !isWebStream(streamUrl)) return;
    const requestedKey = key;
    try { await navigator.clipboard.writeText(streamUrl); if (latestKeyRef.current === requestedKey) setCopied(true); }
    catch { if (latestKeyRef.current === requestedKey) setNotice('Copie indisponible. Utilisez « Ouvrir le flux » pour accéder au lien.'); }
  };

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (screenRef.current?.requestFullscreen) await screenRef.current.requestFullscreen();
      else {
        const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
        else setNotice('Le plein écran n’est pas disponible dans ce navigateur.');
      }
    } catch { setNotice('Le mode plein écran est indisponible pour le moment.'); }
  };

  const pictureInPicture = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current?.requestPictureInPicture();
    } catch { setNotice('L’image dans l’image sera disponible lorsque la vidéo sera chargée.'); }
  };

  return (
    <section className="tv-player" aria-label={channel ? `Lecteur ${channel.name}` : 'Lecteur télévision'}>
      <div className={`tv-player__screen tv-player__screen--${status}`} ref={screenRef}>
        <video ref={videoRef} className="tv-player__video" controls={!showStart && status !== 'error'} playsInline preload="none" aria-label={channel ? `Direct de ${channel.name}` : 'Vidéo en direct'} />
        {(showStart || status === 'loading' || status === 'error') && <div className="tv-player__ambient" aria-hidden="true"><i /><i /><i /></div>}

        <div className="tv-player__topline" aria-hidden="true">
          <span className={`tv-player__signal ${status === 'playing' ? 'is-live' : ''}`}><span />{statusLabels[status]}</span>
          <span className="tv-player__screen-label"><Radio size={14} strokeWidth={1.7} /> Télévision en direct</span>
        </div>

        {showStart && <div className="tv-player__welcome">
          {channel ? <>
            <div className="tv-player__channel-logo">
              {channel.logo && brokenLogo !== channel.logo
                ? <img src={channel.logo} alt="" onError={() => setBrokenLogo(channel.logo)} />
                : <Tv size={27} strokeWidth={1.5} />}
            </div>
            <h2>{channel.name}</h2>
            <p>{status === 'ended' ? 'La diffusion est terminée.' : 'Une autre fenêtre sur le monde.'}</p>
            <button type="button" className="tv-player__start" onClick={start} aria-label={`Regarder ${channel.name} en direct`}>
              <Play size={23} fill="currentColor" strokeWidth={0} /><span>{status === 'ended' ? 'Relancer le direct' : 'Regarder le direct'}</span>
            </button>
            <span className="tv-player__welcome-note">Installez-vous, vous êtes au bon endroit.</span>
          </> : <><Tv size={38} strokeWidth={1.3} /><h2>À vous de choisir.</h2><p>Sélectionnez une chaîne pour regarder le direct.</p></>}
        </div>}

        {busy && <div className={`tv-player__loading ${status === 'buffering' ? 'tv-player__loading--compact' : ''}`} role="status">
          <LoaderCircle size={32} className="tv-player__spinner" strokeWidth={1.7} />
          <span>{state.key === key && state.total > 1 ? `Essai de la source ${state.attempted} sur ${state.total}…`
            : status === 'loading' ? `Connexion à ${channel?.name ?? 'la chaîne'}…` : 'Le direct reprend dans un instant…'}</span>
          {state.key === key && state.total > 1 && <small>Nous cherchons une source disponible pour cette chaîne.</small>}
        </div>}

        {status === 'error' && <div className="tv-player__error" role="alert">
          <span className="tv-player__error-icon"><WifiOff size={27} strokeWidth={1.5} /></span>
          <h3>Ce direct se fait attendre.</h3>
          {state.attempted > 0 && <span className="tv-player__attempts">{state.attempted === 1 ? '1 source essayée' : `${state.attempted} sources essayées`} sans succès.</span>}
          <p>{error}</p>
          <div className="tv-player__error-actions">
            <button type="button" className="tv-player__retry" onClick={start}><RotateCcw size={15} /> Réessayer</button>
            {onRefreshSources && <button type="button" onClick={() => void refreshSources()} disabled={refreshing === key}><RotateCcw size={15} className={refreshing === key ? 'tv-player__spinner' : undefined} />{refreshing === key ? 'Actualisation…' : 'Actualiser les sources'}</button>}
            {destination && <a href={destination.url} target="_blank" rel="noopener noreferrer">{destination.label} <ArrowUpRight size={15} /></a>}
          </div>
          <div className="tv-player__error-actions tv-player__error-actions--secondary">
            {hasExternalSources && <button type="button" onClick={downloadPlaylist}><Download size={15} /> Télécharger pour VLC</button>}
            {streamUrl && isWebStream(streamUrl) && <>
              <button type="button" onClick={() => void copyStream()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Lien copié' : 'Copier le lien'}</button>
              <a href={streamUrl} target="_blank" rel="noopener noreferrer">Ouvrir le flux <ArrowUpRight size={15} /></a>
            </>}
            <button type="button" onClick={onNext}><SkipForward size={15} /> Autre chaîne</button>
          </div>
          {destination?.note && <span className="tv-player__destination-note">{destination.note}</span>}
          {hasHttpSources && <span className="tv-player__alternative">Les sources HTTP sont réservées à un lecteur externe.</span>}
          {channel && channel.streams.length > 1 && <span className="tv-player__alternative">Le menu ci-dessous permet aussi d’essayer une source de votre choix.</span>}
        </div>}
      </div>

      <div className="tv-player__toolbar">
        <div className="tv-player__transport">
          <button type="button" className="tv-player__icon-button" onClick={onPrevious} disabled={!channel} aria-label="Chaîne précédente" title="Chaîne précédente"><SkipBack size={18} fill="currentColor" strokeWidth={1.5} /></button>
          <button type="button" className="tv-player__icon-button tv-player__play-button" onClick={status === 'playing' || status === 'buffering' ? () => videoRef.current?.pause() : start} disabled={!channel || status === 'loading'} aria-label={status === 'playing' || status === 'buffering' ? 'Mettre en pause' : 'Lancer la lecture'} title={status === 'playing' || status === 'buffering' ? 'Mettre en pause' : 'Lancer la lecture'}>
            {status === 'playing' || status === 'buffering' ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={19} fill="currentColor" strokeWidth={0} />}
          </button>
          <button type="button" className="tv-player__icon-button" onClick={onNext} disabled={!channel} aria-label="Chaîne suivante" title="Chaîne suivante"><SkipForward size={18} fill="currentColor" strokeWidth={1.5} /></button>
        </div>
        <span className={`tv-player__toolbar-status ${status === 'playing' ? 'is-live' : ''}`} role="status"><span />{statusLabels[status]}</span>
        <div className="tv-player__options">
          {channel && channel.streams.length > 0 && <label className="tv-player__source"><span>Source</span><select aria-label="Source du direct" value={sourceIndex} onChange={event => {
            interactedRef.current = true;
            playbackIntentRef.current.paused = false;
            setSourceChoice({ channelId: channel.id, index: Number(event.target.value) });
            setAttempt(value => value + 1);
          }}>
            {channel.streams.map((stream, index) => <option key={`${stream.url}:${index}`} value={index}>{stream.label || `Source ${index + 1}`}{stream.quality && !stream.label?.includes(stream.quality) ? ` · ${stream.quality}` : ''}</option>)}
          </select><ChevronDown size={13} aria-hidden="true" /></label>}
          {pipSupported && <button type="button" className="tv-player__icon-button tv-player__pip" onClick={() => void pictureInPicture()} disabled={status !== 'playing' && status !== 'paused'} aria-label="Image dans l’image" title="Image dans l’image"><PictureInPicture2 size={19} strokeWidth={1.7} /></button>}
          <button type="button" className="tv-player__icon-button" onClick={() => void fullscreen()} aria-label="Plein écran" title="Plein écran"><Maximize size={18} strokeWidth={1.7} /></button>
        </div>
      </div>
      {notice && <div className="tv-player__notice" role="status">{notice}</div>}
    </section>
  );
}
