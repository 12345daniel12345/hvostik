(function () {
  'use strict';

  // Eye centers and sizes are percentages of the uncropped 1050 × 700 photos.
  const portraits = {
    cat: {
      eyes: [
        { x: 45.50, y: 25.88, w: 2.65, h: 3.24, angle: 13, shade: '#8e6648' },
        { x: 51.63, y: 26.55, w: 2.65, h: 3.24, angle: -13, shade: '#c4906b' },
      ],
      fur: '#a97b5a',
    },
    dog: {
      eyes: [
        { x: 50.88, y: 22.32, w: 3.20, h: 4.43, angle: 9, shade: '#9e6a41' },
        { x: 59.50, y: 21.76, w: 3.08, h: 4.43, angle: -9, shade: '#c98a55' },
      ],
      fur: '#b47a4b',
    },
  };

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null;
  let timer;
  let blinkAt;
  let turnAt;
  let pendingBlink = false;
  const between = (min, max) => min + Math.random() * (max - min);

  function play(el, effect) {
    const attribute = `data-pet-${effect}`;
    if (el.hasAttribute(attribute)) {
      for (const animation of el.getAnimations({ subtree: true })) {
        if (animation.animationName === `pet-${effect}`) animation.currentTime = 0;
      }
    } else {
      el.setAttribute(attribute, '');
    }
  }

  function schedule() {
    timer = setTimeout(tick, Math.max(0, Math.min(blinkAt, turnAt) - performance.now()));
  }

  function tick() {
    if (document.hidden || reducedMotion.matches) return;
    const now = performance.now();
    const resting = active.dataset.petMode === 'missed';

    if (now >= blinkAt) {
      play(active, 'blink');
      blinkAt = now + (resting ? between(7500, 11000) : between(3000, 6000));
    }
    if (now >= turnAt) {
      active.style.setProperty('--pet-angle', Math.random() < 0.5 ? '-1.2deg' : '1.2deg');
      play(active, 'turn');
      turnAt = now + between(8000, 12000);
    }
    schedule();
  }

  function restartIdle() {
    clearTimeout(timer);
    if (!active) return;
    active.toggleAttribute('data-pet-paused', document.hidden);
    if (document.hidden) return;

    if (reducedMotion.matches) {
      if (pendingBlink) play(active, 'blink');
      pendingBlink = false;
      return;
    }
    if (active.dataset.petMode === 'trip' || active.dataset.petTravel === 'leave') return;

    const now = performance.now();
    const resting = active.dataset.petMode === 'missed';
    blinkAt = now + (resting ? between(7500, 11000) : between(3000, 6000));
    turnAt = resting ? Infinity : now + between(8000, 12000);
    schedule();
  }

  function mount(el, species) {
    if (el === active) return;
    clearTimeout(timer);
    active = el;
    pendingBlink = Boolean(el && reducedMotion.matches && !el.hasAttribute('data-pet-quiet'));
    if (!el) return;

    const { eyes, fur } = portraits[species];
    const portrait = el.querySelector('.pet-portrait');
    const photo = el.querySelector('.pet-photo');
    const body = photo.querySelector('img').cloneNode();
    body.className = 'pet-body';
    body.alt = '';
    photo.append(body);
    el.dataset.petSpecies = species;

    for (const { x, y, w, h, angle, shade } of eyes) {
      const lid = document.createElement('span');
      lid.className = 'pet-lid';
      lid.style.setProperty('--lid-angle', `${angle}deg`);
      lid.style.setProperty('--lid-color', `color-mix(in srgb, ${shade} 78%, ${fur})`);
      Object.assign(lid.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });
      photo.append(lid);
    }

    if (portrait instanceof HTMLButtonElement) {
      const hearts = document.createElement('span');
      hearts.className = 'pet-hearts';
      hearts.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) {
        const heart = document.createElement('span');
        heart.textContent = '♥';
        hearts.append(heart);
      }
      portrait.append(hearts);
      portrait.addEventListener('click', () => jump(el));
    }

    el.addEventListener('animationend', (event) => {
      const attribute = `data-${event.animationName}`;
      if (event.animationName.startsWith('pet-') && el.hasAttribute(attribute)) {
        el.removeAttribute(attribute);
      }
    });
    restartIdle();
  }

  function jump(el) {
    if (el !== active || document.hidden || reducedMotion.matches
      || el.dataset.petMode === 'missed' || el.dataset.petMode === 'trip') return;
    for (const effect of ['hop', 'heart', 'blink', 'tremor']) play(el, effect);
  }

  function leave(el) {
    el.dataset.petTravel = 'leave';
    if (el === active) restartIdle();
  }

  function enter(el) {
    el.dataset.petTravel = 'enter';
    if (el === active) restartIdle();
  }

  document.addEventListener('visibilitychange', restartIdle);
  reducedMotion.addEventListener('change', () => {
    if (active) {
      for (const effect of ['blink', 'turn', 'hop', 'heart', 'tremor']) {
        active.removeAttribute(`data-pet-${effect}`);
      }
      delete active.dataset.petTravel;
    }
    restartIdle();
  });

  window.HVPet = { mount, jump, leave, enter };
})();
