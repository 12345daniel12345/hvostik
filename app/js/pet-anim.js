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
  let active;
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
  root.HVPet = { mount, react, isSwipe };
})(globalThis);
