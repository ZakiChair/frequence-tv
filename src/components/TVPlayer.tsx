import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Copy, LoaderCircle, Maximize, Pause, PictureInPicture2, Play, Radio, RotateCcw, SkipBack, SkipForward, Tv, WifiOff } from 'lucide-react';
import type Hls from 'hls.js';
import type { Channel } from '../lib/types';
import { isDirectVideo, isWebStream, preferredStreamIndex, streamProblem } from '../lib/playback';
import './TVPlayer.css';

type Status = 'idle' | 'loading' | 'playing' | 'buffering' | 'paused' | 'ended' | 'error';
type PlayerState = { key: string; status: Status; error?: string };
type Props = {
  channel: Channel | null;
  onNext: () => void;
  onPrevious: () => void;
  onPlaying?: (playing: boolean) => void;
  enabled?: boolean;
  playRequest?: number;
};

const statusLabels: Record<Status, string> = {
  idle: 'Prêt à regarder', loading: 'Connexion au direct…', playing: 'En direct',
  buffering: 'Mise en mémoire tampon…', paused: 'En pause', ended: 'Diffusion terminée', error: 'Source indisponible',
};

export default function TVPlayer({ channel, onNext, onPrevious, onPlaying, enabled = true, playRequest = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const interactedRef = useRef(false);
  const handledPlayRequest = useRef(0);
  const onPlayingRef = useRef(onPlaying);
  const resumeRef = useRef<(() => void) | null>(null);
  const [sourceChoice, setSourceChoice] = useState({ channelId: '', index: 0 });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlayerState>({ key: '', status: 'idle' });
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [brokenLogo, setBrokenLogo] = useState('');
  const sourceIndex = sourceChoice.channelId === channel?.id && channel?.streams[sourceChoice.index]
    ? sourceChoice.index : preferredStreamIndex(channel?.streams ?? []);
  const source = channel?.streams[sourceIndex];
  const streamUrl = source?.url;
  const channelId = channel?.id;
  const key = `${channelId ?? ''}:${streamUrl ?? ''}:${attempt}:${playRequest}`;
  const status = state.key === key ? state.status : (interactedRef.current && channel ? 'loading' : 'idle');
  const error = state.key === key ? state.error : undefined;
  const busy = status === 'loading' || status === 'buffering';
  const showStart = status === 'idle' || status === 'ended';
  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled;

  useEffect(() => { onPlayingRef.current = onPlaying; }, [onPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let failed = false;
    let hls: Hls | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let currentStatus: Status = 'idle';
    let hasPlayed = false;
    const clearTimer = () => { if (timeout) clearTimeout(timeout); timeout = undefined; };
    const update = (next: Status, message?: string) => {
      if (disposed) return;
      currentStatus = next;
      setState({ key, status: next, error: message });
      onPlayingRef.current?.(next === 'playing');
    };
    const fail = (message: string) => {
      if (disposed || failed) return;
      failed = true;
      clearTimer();
      hls?.stopLoad();
      video.pause();
      update('error', message);
    };
    const startTimer = () => {
      if (timeout || failed || disposed) return;
      timeout = setTimeout(() => fail('Le flux ne répond pas après 18 secondes. Réessayez ou choisissez une autre source.'), 18_000);
    };
    const play = () => {
      if (disposed || failed) return;
      update('loading');
      startTimer();
      void video.play().catch((reason: unknown) => {
        if (disposed || failed) return;
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
          clearTimer();
          update('paused');
          setNotice('Appuyez sur lecture pour continuer.');
        } else {
          fail('Votre navigateur ne parvient pas à lire ce flux. Essayez une autre source ou ouvrez le lien dans un lecteur externe.');
        }
      });
    };
    resumeRef.current = play;
    const onPlay = () => { if (!failed) { hasPlayed = true; update('loading'); startTimer(); } };
    const onPlayingEvent = () => { if (!failed) { clearTimer(); update('playing'); } };
    const onWaiting = () => {
      if (!failed && !video.paused) { update('buffering'); startTimer(); }
    };
    const onStalled = () => { if (video.readyState < 3) onWaiting(); };
    const onPause = () => {
      // A previous source's pause event can still be queued when the next source attaches.
      if (!failed && hasPlayed && video.paused && !video.ended) { clearTimer(); update('paused'); }
    };
    const onEnded = () => { if (!failed) { clearTimer(); update('ended'); } };
    const onError = () => {
      if (video.error?.code === 1) return;
      const message = video.error?.code === 3
        ? 'Le format vidéo de cette source n’est pas compatible avec votre navigateur.'
        : 'Cette source ne peut pas être lue ici. Le diffuseur peut être indisponible ou limiter l’accès au flux.';
      fail(message);
    };
    const events: [keyof HTMLMediaElementEventMap, EventListener][] = [
      ['play', onPlay], ['playing', onPlayingEvent], ['waiting', onWaiting],
      ['stalled', onStalled], ['pause', onPause], ['ended', onEnded], ['error', onError],
    ];
    events.forEach(([name, handler]) => video.addEventListener(name, handler));
    setNotice('');
    setCopied(false);

    const load = async () => {
      if (!enabled) { interactedRef.current = false; update('idle'); return; }
      if (playRequest > handledPlayRequest.current) { interactedRef.current = true; handledPlayRequest.current = playRequest; }
      if (!channelId || !interactedRef.current) { update('idle'); return; }
      const problem = streamProblem(streamUrl, window.location.protocol);
      if (problem || !streamUrl) { fail(problem ?? 'Aucune source disponible.'); return; }
      update('loading');
      startTimer();
      const nativeHls = video.canPlayType('application/vnd.apple.mpegurl');
      const safari = /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR|Android/i.test(navigator.userAgent);
      if (isDirectVideo(streamUrl) || (nativeHls && safari)) {
        video.src = streamUrl;
        play();
        return;
      }
      try {
        const { default: HlsPlayer } = await import('hls.js');
        if (disposed || failed) return;
        if (!HlsPlayer.isSupported()) {
          if (nativeHls) { video.src = streamUrl; play(); }
          else fail('Votre navigateur ne prend pas en charge ce flux. Essayez un navigateur récent ou un lecteur externe.');
          return;
        }
        hls = new HlsPlayer({ enableWorker: true, backBufferLength: 30 });
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => { if (currentStatus !== 'paused') play(); });
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR) {
            fail('La connexion au diffuseur a échoué. Le flux peut être indisponible, limité à certains pays ou inaccessible depuis ce site.');
          } else if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR) {
            fail('Le format vidéo de cette source ne peut pas être lu. Essayez une autre source.');
          } else fail('La lecture de cette source a été interrompue. Vous pouvez réessayer.');
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
      } catch {
        fail('Le lecteur n’a pas pu démarrer. Vérifiez votre connexion puis réessayez.');
      }
    };
    void load();
    return () => {
      disposed = true;
      clearTimer();
      resumeRef.current = null;
      events.forEach(([name, handler]) => video.removeEventListener(name, handler));
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
      onPlayingRef.current?.(false);
    };
  }, [key, channelId, streamUrl, enabled, playRequest]);

  useEffect(() => {
    if (!notice && !copied) return;
    const timer = setTimeout(() => { setNotice(''); setCopied(false); }, 4500);
    return () => clearTimeout(timer);
  }, [notice, copied]);

  const start = () => {
    if (status === 'paused' && interactedRef.current) {
      resumeRef.current?.();
      return;
    }
    interactedRef.current = true;
    setAttempt(value => value + 1);
  };

  const copyStream = async () => {
    if (!streamUrl || !isWebStream(streamUrl)) return;
    try { await navigator.clipboard.writeText(streamUrl); setCopied(true); }
    catch { setNotice('Copie indisponible. Utilisez « Ouvrir le flux » pour accéder au lien.'); }
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
          <span>{status === 'loading' ? `Connexion à ${channel?.name ?? 'la chaîne'}…` : 'Le direct reprend dans un instant…'}</span>
        </div>}

        {status === 'error' && <div className="tv-player__error" role="alert">
          <span className="tv-player__error-icon"><WifiOff size={27} strokeWidth={1.5} /></span>
          <h3>Ce direct se fait attendre.</h3>
          <p>{error}</p>
          <div className="tv-player__error-actions">
            <button type="button" className="tv-player__retry" onClick={start}><RotateCcw size={15} /> Réessayer</button>
            {streamUrl && isWebStream(streamUrl) && <>
              <button type="button" onClick={() => void copyStream()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Lien copié' : 'Copier le lien'}</button>
              <a href={streamUrl} target="_blank" rel="noopener noreferrer">Ouvrir le flux <ArrowUpRight size={15} /></a>
            </>}
          </div>
          {channel && channel.streams.length > 1 && <span className="tv-player__alternative">Vous pouvez aussi choisir une autre source ci-dessous.</span>}
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
          {channel && channel.streams.length > 0 && <label className="tv-player__source"><span>Source</span><select aria-label="Source du direct" value={sourceIndex} onChange={event => setSourceChoice({ channelId: channel.id, index: Number(event.target.value) })}>
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
