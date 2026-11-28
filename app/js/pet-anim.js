(function (root) {
  'use strict';

  function isSwipe(direction, dx, dy) {
    const threshold = 44;
    if (direction === 'side') return Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.25;
    if (direction === 'up') return -dy >= threshold && -dy > Math.abs(dx) * 1.25;
    if (direction === 'down') return dy >= threshold && dy > Math.abs(dx) * 1.25;
    return false;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isSwipe };
    return;
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Живые ИИ-видео (Kling, 28.11.2026): бесшовные петли 5 с. «idle» — питомец дышит и моргает,
  // «talk» — говорит; включается на время реплики. Без видео остаётся прежняя картинка.
  const LIVE = {
    'cat-home': { idle: 'video/cat-home-idle.mp4?v=1', talk: 'video/cat-home-talk.mp4?v=1' },
  };
  let active;
  let talkTimer;
  let pauseTimer;
  let lightTimer;

  function scheduleLight() {
    clearTimeout(lightTimer);
    if (!active || document.hidden || reducedMotion.matches) return;
    lightTimer = setTimeout(() => {
      active.animate([{ opacity: 0 }, { opacity: 0.18 }, { opacity: 0 }], {
        duration: 580, easing: 'cubic-bezier(.2,.8,.2,1)',
      });
      scheduleLight();
    }, 9500 + Math.random() * 9000);
  }

  function mount(stage, file) {
    clearTimeout(talkTimer);
    clearTimeout(pauseTimer);
    const existing = stage.querySelector('.pet-current');
    const previous = stage.querySelector('.pet-previous');
    previous?.remove();
    if (existing) {
      existing.classList.replace('pet-current', 'pet-previous');
      setTimeout(() => existing.remove(), 640);
    }
    const layer = document.createElement('div');
    layer.className = 'pet-current pet-layer';
    layer.dataset.frame = file.split('/').at(-1);
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<div class="pet-frame"><div class="pet-camera"><div class="pet-breath"><img alt="" draggable="false"></div></div></div>';
    layer.querySelector('img').src = `img/${file}.webp?v=4`;
    const live = LIVE[layer.dataset.frame];
    mediaKind('Иллюстрация');
    if (live && !reducedMotion.matches) addLive(layer, live);
    const light = document.createElement('div');
    light.className = 'pet-light';
    layer.append(light);
    stage.prepend(layer);
    if (!stage.querySelector('.scene-tap')) {
      const tap = document.createElement('button');
      tap.type = 'button';
      tap.className = 'scene-tap';
      tap.dataset.action = 'next-line';
      tap.setAttribute('aria-label', 'Следующая реплика');
      stage.append(tap);
    }
    active = light;
    scheduleLight();
  }

  function mediaKind(text) {
    const label = document.querySelector('#media-kind');
    if (label) label.textContent = text;
  }

  function liveVideo(src, kind) {
    const video = document.createElement('video');
    video.className = `pet-video pet-video-${kind}`;
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: kind === 'idle' ? 'auto' : 'metadata' });
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.src = src;
    return video;
  }

  function addLive(layer, live) {
    const breath = layer.querySelector('.pet-breath');
    const idle = liveVideo(live.idle, 'idle');
    const talk = live.talk ? liveVideo(live.talk, 'talk') : null;
    breath.append(idle);
    if (talk) breath.append(talk);
    idle.addEventListener('playing', () => {
      layer.classList.add('pet-live');
      if (layer.classList.contains('pet-current')) mediaKind('ИИ-видео');
    }, { once: true });
    idle.play().catch(() => { /* автозапуск запрещён — остаётся картинка */ });
  }

  // Питомец «говорит» на экране столько, сколько длится реплика.
  function talk(stage, ms) {
    const layer = stage.querySelector('.pet-current');
    const video = layer?.querySelector('.pet-video-talk');
    if (!video || reducedMotion.matches) return;
    clearTimeout(talkTimer);
    clearTimeout(pauseTimer);
    if (!layer.classList.contains('pet-talking')) {
      video.currentTime = 0;
      video.play().then(() => layer.classList.add('pet-talking')).catch(() => {});
    }
    talkTimer = setTimeout(() => {
      layer.classList.remove('pet-talking');
      pauseTimer = setTimeout(() => video.pause(), 400);
    }, Math.max(1600, ms));
  }

  function react(stage) {
    if (reducedMotion.matches) return;
    stage.querySelector('.pet-frame').animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.026)' },
      { transform: 'scale(1)' },
    ], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  document.addEventListener('visibilitychange', scheduleLight);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      for (const animation of active?.parentElement.getAnimations({ subtree: true }) ?? []) {
        animation.cancel();
      }
    }
    scheduleLight();
  });
  root.HVPet = { mount, react, talk, isSwipe };
})(globalThis);
