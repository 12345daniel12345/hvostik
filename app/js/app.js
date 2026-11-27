(function () {
  'use strict';

  const H = window.Hvostik;
  const petAnimation = window.HVPet;
  const cities = window.HV_CITIES;
  const videos = window.HV_VIDEOS || {};
  const mapData = window.HVMap;
  const params = new URLSearchParams(location.search);
  const guestMode = params.has('guest');
  const guest = guestMode ? H.decodeGuest(params.get('guest'), cities) : null;
  const checkMode = params.get('check') === '1';
  const storageKey = 'hvostik.v1';
  const childKey = `${storageKey}.child`;
  const species = { cat: ['Кот', 'Пряник'], dog: ['Собака', 'Бублик'] };
  const petPostcards = {
    cat: { tula: 'cat-tula', baikal: 'cat-baikal', 'veliky-ustyug': 'cat-ustug' },
    dog: { tula: 'tula', kazan: 'dog-kazan', spb: 'dog-spb' },
  };
  const cityPhotos = { 'veliky-ustyug': 'ustug' };
  const timeFormat = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const screen = document.querySelector('#screen');
  const art = document.querySelector('#scene-art');
  const controls = document.querySelector('#scene-controls');
  const menu = document.querySelector('#menu');
  const menuButton = document.querySelector('#menu-button');
  const notice = document.querySelector('#storage-notice');
  const sheet = document.querySelector('#sheet');
  const content = document.querySelector('#sheet-content');

  let pet = null;
  let child = false;
  let selectedSpecies = 'cat';
  let draftName = species.cat[1];
  let choosing = false;
  let sheetView;
  let sheetReturnFocus;
  let cardId;
  let menuOpen = false;
  let returnTimer;
  let routeTimer;
  let journeyTimer;
  let renderedDay;
  let renderedLight;
  let renderedScene;
  let speechKey;
  let lines = [];
  let lineIndex = 0;
  let speechTimer;
  let typingTimer;
  let cheeringAt;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  function localDay(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function lightAt(hour) {
    if (hour >= 21 || hour < 6) return 'night';
    if (hour < 11) return 'morning';
    return hour < 17 ? 'day' : 'evening';
  }

  function store(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      notice.hidden = false;
    }
  }

  function restore() {
    try {
      const candidate = JSON.parse(localStorage.getItem(storageKey))?.pet;
      if (candidate && typeof candidate.name === 'string' && H.SPECIES.includes(candidate.species)) {
        pet = H.normalizePet(candidate);
      }
      child = localStorage.getItem(childKey) === '1';
    } catch {
      notice.hidden = false;
    }
  }

  function savePet(next) {
    pet = next;
    store(storageKey, JSON.stringify({ pet, 'cities-version': 2 }));
  }

  const cityById = (id) => H.findCity(cities, id);
  const arrivalCard = () => pet?.postcards.find((card) => card.id === pet.arrival?.cardId);
  const selectedCard = () => pet.postcards.find((card) => card.id === cardId);
  const photoFor = (city, animal) => petPostcards[animal]?.[city.id] ?? cityPhotos[city.id] ?? city.id;
  const unverified = (city) => city?.проверено === false ? '<small class="verification">Факты проверяются</small>' : '';
  const button = (label, action, attrs = '', kind = '') =>
    `<button type="button" class="button ${kind}" data-action="${action}" ${attrs}>${label}</button>`;
  const title = (text) => `<h2 id="sheet-title" tabindex="-1">${text}</h2>`;
  const figure = (file, alt) => `<figure class="sheet-photo">
    <img src="img/${file}.webp?v=3" alt="${escapeHtml(alt)}"><figcaption>Иллюстрация</figcaption>
  </figure>`;

  function nextCity(from = pet.postcards[0]?.cityId) {
    return cityById(pet.nextStopId) ?? cities[(cities.findIndex((city) => city.id === from) + 1) % cities.length];
  }

  function restingPhoto(animal, city) {
    return city ? petPostcards[animal]?.[city.id] ?? `${animal}-away` : `${animal}-home`;
  }

  function stopScene(mode, city) {
    const file = pet.species === 'cat' && city.id === 'tula'
      ? `live/cat-${mode === 'call' ? 'call' : 'story'}-tula` : restingPhoto(pet.species, city);
    return { mode, city, file };
  }

  function scene() {
    if (guestMode) {
      const city = cityById(guest?.cityId);
      return { mode: 'guest', city, file: restingPhoto(guest?.species ?? 'cat', city) };
    }
    if (!pet || choosing) return { mode: 'choose', file: `${selectedSpecies}-home` };
    if (cheeringAt) return stopScene('joy', cheeringAt);
    if (pet.trip) {
      const city = cityById(pet.trip.cityId);
      const night = pet.trip.kind === 'care' && renderedLight === 'night';
      const file = pet.species === 'cat' ? (night ? 'live/cat-night' : 'live/cat-train') : 'dog-road';
      return { mode: night ? 'night' : 'trip', city, file };
    }
    const card = arrivalCard();
    const city = cityById(card?.cityId ?? pet.postcards[0]?.cityId);
    if (card) return stopScene(pet.arrival.answered ? 'story' : 'call', city);
    return { mode: 'home', city, file: restingPhoto(pet.species, city) };
  }

  function heading(text, context = '') {
    return `<header class="scene-heading glass">${context ? `<p>${context}</p>` : ''}
      <h1 id="scene-title" tabindex="-1">${text}</h1></header>`;
  }

  const subtitle = () => `<div class="subtitle glass" id="subtitle" hidden>
    <span id="subtitle-text" aria-hidden="true"></span><span class="sr-only" id="subtitle-live" aria-live="polite"></span>
  </div>`;

  function diaryHandle() {
    return `<button class="diary-handle" type="button" data-action="diary" data-gesture="diary"
      aria-label="Открыть дневник" aria-haspopup="dialog"><span aria-hidden="true"></span>Дневник</button>`;
  }

  function choiceView() {
    const [label] = species[selectedSpecies];
    return `${heading(label, 'Выбери спутника')}
      <form id="adopt" class="scene-bottom">
        <div class="species-switch" role="group" aria-label="Выбор питомца">
          ${button('‹', 'species', 'aria-label="Предыдущий питомец"', 'round')}
          <span>Листай влево или вправо</span>
          ${button('›', 'species', 'aria-label="Следующий питомец"', 'round')}
        </div>
        <label class="name-field glass" for="pet-name"><span>Имя питомца</span>
          <input id="pet-name" name="pet-name" maxlength="20" required autocomplete="off" value="${escapeHtml(draftName)}">
        </label>
        <button class="button primary" type="submit">Выбрать</button>
        ${choosing ? button('Вернуться', 'cancel-choice', '', 'text-button') : ''}
      </form>`;
  }

  function routeThread(city) {
    const from = cityById(pet.trip.fromCityId)?.name ?? 'Москва';
    return `<button type="button" class="route-thread" data-action="route" aria-haspopup="dialog"
      aria-label="Открыть карту маршрута: ${from} → ${city.name}">
      <span class="thread-track" aria-hidden="true"><i></i><i></i><span class="thread-marker"></span></span>
      <span class="thread-labels" aria-hidden="true"><span>${from}</span><span>${city.name}</span></span>
    </button>`;
  }

  function sceneView({ mode, city }) {
    if (mode === 'choose') return choiceView();
    if (mode === 'guest') {
      return guest ? `${heading(escapeHtml(guest.name), 'В гости')}<div class="scene-bottom">${subtitle()}
        ${unverified(city)}${button('Открыть открытку', 'guest-card', 'aria-haspopup="dialog"', 'primary')}</div>`
        : `${heading('Ссылка не открывается')}<div class="scene-bottom">
          <a class="button primary" href="index.html">Завести питомца</a></div>`;
    }
    const name = escapeHtml(pet.name);
    if (mode === 'call') {
      return `${heading(`${name} · ${city.name}`, 'Входящий звонок')}<div class="scene-bottom call-bottom">
        <button class="button primary answer-call" type="button" data-action="answer-call" aria-label="Ответить">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M6.5 3.5 9 7.8l-2.1 2.1a14 14 0 0 0 7.2 7.2l2.1-2.1 4.3 2.5-1.1 3.1c-.2.5-.7.9-1.3.9A17.6 17.6 0 0 1 2.5 5.9c0-.6.4-1.1.9-1.3z" fill="currentColor"/></svg>
        </button><span class="call-label" aria-hidden="true">Ответить</span></div>`;
    }
    if (mode === 'trip' || mode === 'night') {
      return `${heading(name, mode === 'trip' ? 'В дороге' : 'В дороге · ночь')}
        <div class="scene-bottom">${subtitle()}${routeThread(city)}</div>${diaryHandle()}`;
    }
    const context = mode === 'story' || mode === 'joy' ? 'На остановке' : city?.name ?? 'Дома';
    const place = mode === 'story' || mode === 'joy' ? city.name : name;
    return `${heading(place, context)}
      <div class="scene-bottom">${subtitle()}
        ${mode === 'story' ? unverified(city) : ''}
        ${!pet.introDone ? button(`Поехать · ${nextCity().name}`, 'intro', '', 'primary') : ''}
        <div id="scene-action" hidden></div>
      </div>${diaryHandle()}`;
  }

  function taskFor(city) {
    const tasks = H.TASKS.filter((task) => !task.cityId || task.cityId === city?.id);
    const stored = tasks.find((task) => task.id === H.careForDay(pet, localDay())?.taskId);
    const link = city?.на_остановке;
    const linkedTask = tasks.find((task) => task.id === (link?.taskId ?? link));
    const preferred = linkedTask ?? tasks.find((task) => task.cityId) ?? tasks.find((task) => task.id === 'breath');
    const text = linkedTask ? '' : typeof link === 'string' ? link : link?.действие;
    return { task: stored ?? preferred, text: !stored || stored.id === preferred.id ? text : '' };
  }

  function renderTask(city) {
    const slot = controls.querySelector('#scene-action');
    if (!slot) return;
    const { task, text } = taskFor(city);
    slot.innerHTML = `<button type="button" class="button primary task-pill" data-action="complete-care"
      data-gesture="care" data-value="${task.id}" aria-describedby="task-hint">
      <span class="task-arrow" aria-hidden="true">↑</span><span>${escapeHtml(text || task[pet.species])}</span>
      </button><div class="task-meta"><span id="task-hint">Проведи вверх, когда сделаешь</span>
      ${button('другое дело', 'care-options', 'aria-haspopup="dialog"', 'text-button')}</div>`;
    slot.hidden = false;
  }

  function storyLines(city) {
    // Пункты «known» в данных — короткие ярлыки («Самовары»). Питомец произносит их фразой, без новых фактов.
    const lead = ['Этим город знаменит: ', 'А ещё здесь — ', 'И ещё: '];
    const said = (item, index) => item && `${lead[Math.min(index, lead.length - 1)]}${item.charAt(0).toLowerCase()}${item.slice(1)}.`;
    const labeled = (label, text) => text && `${label}: ${text.charAt(0).toLowerCase()}${text.slice(1)}.`;
    const facts = child ? [said(city.known[city.id === 'tula' ? 1 : 0], 0), city.fact]
      : [city.tagline, ...city.known.map(said), city.fact,
        labeled('Что попробовать', city.food), labeled('Когда ехать', city.when)];
    const joke = window.HV_PHRASES[city.id];
    if (joke && pet.jokeDay !== localDay()) facts.push({ text: joke, joke: true });
    return facts.filter(Boolean);
  }

  function clearSpeech() {
    clearTimeout(speechTimer);
    clearInterval(typingTimer);
  }

  function speak(line, animate = true) {
    clearInterval(typingTimer);
    const box = controls.querySelector('#subtitle');
    if (!box) return;
    const text = typeof line === 'string' ? line : line.text;
    if (line.joke) savePet({ ...pet, jokeDay: localDay() });
    box.hidden = false;
    const visible = box.querySelector('#subtitle-text');
    box.querySelector('#subtitle-live').textContent = text;
    if (!animate || reducedMotion.matches) {
      visible.textContent = text;
      return;
    }
    const words = text.split(' ');
    let count = 1;
    visible.textContent = words[0];
    typingTimer = setInterval(() => {
      visible.textContent = words.slice(0, ++count).join(' ');
      if (count >= words.length) clearInterval(typingTimer);
    }, 42);
  }

  function scheduleSpeech() {
    clearTimeout(speechTimer);
    if (lineIndex < lines.length && !sheet.open && !menuOpen && !document.hidden) {
      speechTimer = setTimeout(advanceSpeech, 5000);
    }
  }

  function advanceSpeech() {
    if (lineIndex >= lines.length) return;
    lineIndex += 1;
    if (lineIndex < lines.length) speak(lines[lineIndex]);
    else if (renderedScene.mode === 'story') {
      revealNextStep(renderedScene.city);
      const tap = art.querySelector('[data-action="next-line"]');
      if (document.activeElement === tap) {
        (controls.querySelector('.task-pill, [data-action="depart"]') ?? controls.querySelector('h1')).focus();
      }
      tap.hidden = true;
    }
    else if (lines.length > 1) {
      lineIndex = 0;
      speak(lines[lineIndex]);
    }
    scheduleSpeech();
  }

  function revealNextStep(city) {
    const care = H.careForDay(pet, localDay());
    if (care?.tripUsed) {
      speak('Завтра — следующая остановка.');
      return;
    }
    if (care?.done) {
      controls.querySelector('#scene-action').innerHTML = button(`Поехать · ${nextCity().name}`, 'depart', '', 'primary');
      controls.querySelector('#scene-action').hidden = false;
      return;
    }
    renderTask(city);
  }

  function setupSpeech(state) {
    clearSpeech();
    const key = `${state.mode}/${state.city?.id ?? ''}/${arrivalCard()?.id ?? ''}/${child}/${renderedDay}`;
    if (key !== speechKey) {
      speechKey = key;
      lineIndex = 0;
      const { mode, city } = state;
      lines = ({
        home: () => pet.introDone
          ? [pet.care?.dayKey < renderedDay && !pet.care.done
            ? 'Сегодня достаточно одного маленького дела.' : 'Одно небольшое дело — и я продолжу путь.']
          : ['Я готов к первой поездке. Поехали в Тулу?'],
        trip: () => pet.trip.kind === 'intro' ? [city.tagline] : [city.tagline, `Следующий звонок около ${timeFormat.format(pet.trip.returnAt)}.`],
        night: () => ['Завтра — следующая остановка.'],
        story: () => storyLines(city),
        joy: () => ['Спасибо! Пора дальше.'],
        guest: () => guest ? [city.tagline, city.fact] : [],
      }[mode] ?? (() => []))();
      if (mode === 'home' && !pet.introDone && nextCity().id !== 'tula') {
        lines = ['Я готов к первой поездке. Поехали?'];
      }
    }
    if (lines.length) speak(lines[Math.min(lineIndex, lines.length - 1)], lineIndex < lines.length);
    if ((state.mode === 'story' && lineIndex >= lines.length) || (state.mode === 'home' && pet.introDone)) {
      revealNextStep(state.city);
    }
    const canSpeak = state.mode === 'story' ? lineIndex < lines.length : lines.length > 1;
    const tap = art.querySelector('[data-action="next-line"]');
    if (tap) tap.hidden = !canSpeak;
    scheduleSpeech();
  }

  function renderMenu() {
    menu.hidden = !menuOpen;
    menuButton.setAttribute('aria-expanded', String(menuOpen));
    if (!menuOpen) return;
    menu.innerHTML = `${button('Выбор питомца', 'edit-pet')}
      <label><input type="checkbox" id="child-mode" ${child ? 'checked' : ''}>Детский режим</label>
      ${button('В гости', 'guest-share')}
      ${checkMode && pet?.trip ? button('Для проверки: ускорить прибытие', 'accelerate') : ''}
      ${button('Сбросить питомца', 'reset', '', 'reset')}`;
  }

  function render(focusHeading = false) {
    renderedDay = localDay();
    renderedLight = lightAt(new Date().getHours());
    const state = scene();
    screen.dataset.scene = state.mode;
    screen.dataset.light = renderedLight;
    const photoKey = `${state.file}/${pet?.color ?? ''}`;
    if (art.dataset.photo !== photoKey) {
      petAnimation.mount(art, state.file);
      art.dataset.photo = photoKey;
      art.dataset.fur = pet?.color ?? '';
    }
    renderedScene = state;
    controls.innerHTML = sceneView(state);
    setupSpeech(state);
    menuButton.hidden = guestMode || !pet || choosing;
    renderMenu();
    updateRoute();
    if (focusHeading && !sheet.open) controls.querySelector('h1')?.focus({ preventScroll: true });
  }

  function startTrip(city, traveller = pet, cheerCity = null, now = new Date()) {
    const today = localDay(now);
    if (!H.canStartTrip(traveller, city.id, cities, today).ok) return;
    const fromCityId = traveller.postcards[0]?.cityId;
    const next = H.startTrip(traveller, city.id, cities, now.getTime(), today);
    savePet({ ...next, arrival: null, nextStopId: null, trip: { ...next.trip, fromCityId } });
    cheeringAt = cheerCity;
    render(true);
    if (cheeringAt) {
      petAnimation.react(art);
      journeyTimer = setTimeout(() => {
        cheeringAt = null;
        render();
      }, 850);
    }
    checkReturn();
  }

  function checkReturn() {
    clearTimeout(returnTimer);
    if (!pet?.trip || guestMode) return false;
    const now = Date.now();
    const remaining = pet.trip.returnAt - now;
    if (remaining > 0) {
      returnTimer = setTimeout(checkReturn, remaining);
      return false;
    }
    const result = H.finishTrip(pet, cities, now, crypto.randomUUID());
    if (!result.postcard) return false;
    savePet({ ...result.pet, arrival: { cardId: result.postcard.id, answered: false } });
    if (sheetView === 'route') closeSheet();
    if (sheetView === 'diary') renderSheet('diary');
    render();
    return true;
  }

  function refreshClock() {
    if (checkReturn()) return;
    if (!guestMode && (renderedDay !== localDay() || renderedLight !== lightAt(new Date().getHours()))) render();
    updateRoute();
  }

  function changeChoice() {
    const next = selectedSpecies === 'cat' ? 'dog' : 'cat';
    if (!draftName.trim() || draftName === species[selectedSpecies][1]) draftName = species[next][1];
    selectedSpecies = next;
    render();
  }

  function routeDistance(from, to) {
    const radians = (value) => value * Math.PI / 180;
    const lat1 = radians(from.lat), lat2 = radians(to.lat);
    const dLat = lat2 - lat1, dLon = radians(to.lon - from.lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function routeMap(city) {
    const origin = cityById(pet.trip.fromCityId);
    const originName = origin?.name ?? 'Москва';
    const home = origin?.coordinates ?? mapData.home;
    const start = mapData.project(home.lon, home.lat);
    const end = mapData.project(city.coordinates.lon, city.coordinates.lat);
    const separation = Math.hypot(end.x - start.x, end.y - start.y);
    const bend = Math.max(30, Math.min(85, separation * 0.11));
    const controlX = (start.x + end.x) / 2;
    const controlY = Math.max(30, (start.y + end.y) / 2 - bend);
    const route = `M${start.x.toFixed(1)},${start.y.toFixed(1)} Q${controlX.toFixed(1)},${controlY.toFixed(1)} ${end.x.toFixed(1)},${end.y.toFixed(1)}`;
    const anchors = (point, toLeft) => {
      if (point.x < 220) return { x: 28, y: toLeft ? -26 : 30, side: 'start' };
      if (point.x > 810) return { x: -28, y: toLeft ? -26 : 30, side: 'end' };
      if (separation < 210) return { x: toLeft ? -29 : 29, y: 6, side: toLeft ? 'end' : 'start' };
      return { x: 0, y: point.y < 65 ? 30 : -26, side: 'middle' };
    };
    const label = (point, name, toLeft) => {
      const { x, y, side } = anchors(point, toLeft);
      return `<text x="${x}" y="${y}" text-anchor="${side}">${name}</text>`;
    };
    return `${title(`${originName} → ${city.name}`)}
      <div class="route-meta"><span>≈ ${routeDistance(home, city.coordinates)} км по прямой</span>
      <span class="route-percent" data-route-percent>0%</span></div>
      <svg class="route-map" viewBox="${mapData.viewBox}" role="img" aria-label="${originName} → ${city.name}, по прямой">
        <path class="russia-shape" fill-rule="evenodd" d="${mapData.shape}"></path>
        ${cities.filter((item) => item.id !== city.id && item.id !== origin?.id).map((item) => {
          const point = mapData.project(item.coordinates.lon, item.coordinates.lat);
          return `<circle class="map-other-city" cx="${point.x}" cy="${point.y}" r="4"><title>${item.name}</title></circle>`;
        }).join('')}
        <path class="route-base" d="${route}"></path>
        <path class="route-progress" d="${route}"></path>
        <g class="map-home" transform="translate(${start.x} ${start.y})"><circle r="9"></circle>
          ${label(start, originName, start.x <= end.x)}</g>
        <g class="map-destination" transform="translate(${end.x} ${end.y})"><circle class="destination-ring" r="19"></circle>
          <circle r="8"></circle>${label(end, city.name, start.x > end.x)}</g>
        <g class="route-marker" transform="translate(${start.x} ${start.y})"><circle r="12"></circle></g>
      </svg>
      <p class="muted">Карта: Natural Earth · точки: © участники OpenStreetMap.</p>`;
  }

  function updateRoute() {
    clearTimeout(routeTimer);
    const trip = pet?.trip;
    const thread = controls.querySelector('.thread-track');
    if (!trip || !thread) return;
    const progress = Math.max(0, Math.min(1, (Date.now() - trip.startedAt) / (trip.returnAt - trip.startedAt)));
    thread.style.setProperty('--progress', `${progress * 100}%`);
    const path = content.querySelector('.route-progress');
    if (path && sheet.open) {
      const length = path.getTotalLength();
      const point = path.getPointAtLength(length * progress);
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length * (1 - progress));
      content.querySelector('.route-marker').setAttribute('transform', `translate(${point.x} ${point.y})`);
      content.querySelector('[data-route-percent]').textContent = `${Math.floor(progress * 100)}%`;
    }
    if (progress < 1 && !document.hidden) {
      routeTimer = setTimeout(updateRoute, trip.kind === 'intro' && !reducedMotion.matches ? 80 : 1000);
    }
  }

  function diaryView() {
    return `${title('Дневник')}
      ${pet.postcards.length ? `<div class="photo-stack">${pet.postcards.map((card) => {
        const city = cityById(card.cityId);
        return `<button class="print" type="button" data-action="postcard" data-value="${escapeHtml(card.id)}">
          <img src="img/${photoFor(city, pet.species)}.webp?v=3" alt="" loading="lazy">
          <span>${city.name}</span><small>Иллюстрация</small></button>`;
      }).join('')}</div>` : '<p>Первая открытка появится после поездки.</p>'}
      <div class="sheet-row">${button('Паспорт', 'passport')}${button('Маршруты', 'destinations')}</div>`;
  }

  function destinationsView() {
    const passport = H.passport(pet, cities);
    return `${title('Маршруты')}${button('‹ Дневник', 'diary', '', 'text-button')}
      ${pet.trip ? button('Карта поездки', 'route') : ''}
      <div class="route-list">${passport.routes.map((route) => `<div class="route-label">
        <label>${route.name}<progress value="${route.done}" max="${route.total}"></progress></label>
        <small>${route.done} / ${route.total}</small></div>`).join('')}</div>
      ${pet.trip ? '' : `<form id="destination-form"><label for="destination">Следующая остановка</label>
        <select id="destination" name="city">${cities.filter((city) => city.id !== pet.postcards[0]?.cityId)
          .map((city) => `<option value="${city.id}" ${nextCity().id === city.id ? 'selected' : ''}>${city.name}</option>`).join('')}
        </select><button class="button primary" type="submit">Выбрать остановку</button></form>`}`;
  }

  function postcardMedia(city, animal) {
    const file = photoFor(city, animal);
    const video = videos[animal]?.[city.id];
    return video ? `<figure class="sheet-photo">
      <video controls playsinline muted preload="metadata" poster="img/${file}.webp?v=3" aria-label="ИИ-видео: ${city.name}">
        <source src="video/${video}.mp4" type="video/mp4"></video><figcaption>ИИ-видео</figcaption>
      </figure>` : figure(file, city.name);
  }

  function postcardView(card, visitor = false) {
    const city = cityById(card.cityId);
    return `${title(city.name)}${visitor ? '' : button('‹ Дневник', 'diary', '', 'text-button')}
      ${postcardMedia(city, visitor ? guest.species : pet.species)}
      <p class="postcard-letter">«${window.HV_PHRASES[city.id]}»</p>
      <div class="postcard-facts"><ul>${(child ? city.known.slice(0, 1) : city.known).map((fact) => `<li>${fact}</li>`).join('')}</ul>
        <p>${city.fact}</p><p><strong>Что попробовать</strong> ${city.food}</p>
        <p><strong>Когда поехать</strong> ${city.when}</p>${unverified(city)}</div>
      ${visitor ? '<a class="button primary" href="index.html">Завести питомца</a>' :
        `${button(card.answered ? 'Открыть ответ' : 'Ответить на вопрос', 'quiz', '', 'primary')}
          <div class="sheet-row">
            ${button('Хочу сюда', 'wish', `aria-pressed="${pet.wish.includes(city.id)}"`)}
            ${button('В гости', 'share')}
          </div><div id="share-box" hidden>${shareField()}</div>`}`;
  }

  function quizView() {
    const card = selectedCard();
    const city = cityById(card.cityId);
    return `${title('Один вопрос')}<p class="quiz-question">${city.quiz.question}</p>${card.answered
      ? `<p role="status">${card.correct ? 'Знание добавлено в паспорт.' : 'Теперь точно запомнишь.'}
          <br>Правильный ответ: ${city.quiz.options[city.quiz.correct]}</p>`
      : `<div class="sheet-options">${city.quiz.options.map((option, index) =>
        button(option, 'answer', `data-value="${index}"`)).join('')}</div>`}
      ${button('‹ Открытка', 'postcard', `data-value="${escapeHtml(card.id)}"`, 'text-button')}`;
  }

  function passportView() {
    const passport = H.passport(pet, cities);
    return `${title('Паспорт')}${button('‹ Дневник', 'diary', '', 'text-button')}
      <p>Городов: ${passport.visitedCount} из ${passport.total} · Знаний: ${passport.knowledgeCount}</p>
      <div class="stamps">${cities.map((city) => {
        const card = pet.postcards.find((item) => item.cityId === city.id);
        return card ? button(city.name, 'postcard', `data-value="${escapeHtml(card.id)}"`)
          : `<span aria-label="${city.name}, закрыто">${city.name}</span>`;
      }).join('')}</div>
      <h3>Хочу сюда</h3><div class="stamps">${pet.wish.length ? pet.wish.map(cityById).filter(Boolean)
        .map((city) => `<span>${city.name}</span>`).join('') : '<p>Сохраняй места, в которых хочешь побывать.</p>'}</div>`;
  }

  function careView() {
    const { city } = renderedScene;
    return `${title('Другое дело')}<div class="sheet-options">
      ${H.TASKS.filter((task) => !task.cityId || task.cityId === city?.id).map((task) =>
        button(task[pet.species], 'pick-care', `data-value="${task.id}"`)).join('')}</div>`;
  }

  function shareField() {
    return `<label for="guest-url">Ссылка «В гости»</label><input id="guest-url" type="text" readonly>
      <p id="share-status" role="status"></p>`;
  }

  function renderSheet(view) {
    const views = {
      diary: diaryView, route: () => routeMap(cityById(pet.trip.cityId)), destinations: destinationsView,
      postcard: () => postcardView(selectedCard()), 'guest-card': () => postcardView(guest, true),
      quiz: quizView, passport: passportView, care: careView,
      share: () => `${title('В гости')}${pet.postcards.length ? shareField() : '<p>Ссылка появится после первой поездки.</p>'}`,
    };
    sheetView = view;
    content.innerHTML = views[view]();
    content.scrollTop = 0;
    const video = content.querySelector('video');
    const fallback = () => {
      if (!video.isConnected) return;
      const city = cityById((guestMode ? guest : selectedCard()).cityId);
      video.closest('figure').outerHTML = figure(photoFor(city, guestMode ? guest.species : pet.species), city.name);
    };
    if (video) {
      video.addEventListener('error', fallback, { once: true });
      video.querySelector('source').addEventListener('error', fallback, { once: true });
      if (!reducedMotion.matches) video.play().catch(() => {});
    }
  }

  function openSheet(view) {
    if (!sheet.open) sheetReturnFocus = document.activeElement;
    renderSheet(view);
    if (!sheet.open) sheet.showModal();
    sheet.querySelector('h2').focus({ preventScroll: true });
    scheduleSpeech();
    updateRoute();
  }

  function closeSheet() {
    if (!sheet.open) return;
    sheet.close();
    sheetView = null;
    content.replaceChildren();
    const fallback = controls.querySelector('.diary-handle') ?? controls.querySelector('h1');
    (sheetReturnFocus?.isConnected && !sheetReturnFocus.closest('[hidden]') ? sheetReturnFocus : fallback)?.focus();
    scheduleSpeech();
  }

  async function share(card) {
    const url = new URL('index.html', location.href);
    url.searchParams.set('guest', H.encodeGuest(pet, card.cityId));
    const box = content.querySelector('#share-box');
    if (box) box.hidden = false;
    const input = content.querySelector('#guest-url');
    const status = content.querySelector('#share-status');
    input.value = url.href;
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = 'Ссылка скопирована.';
    } catch {
      if (!input.isConnected) return;
      input.focus();
      input.select();
      status.textContent = 'Ссылка выделена для копирования.';
    }
  }

  function completeCare(target) {
    const now = new Date();
    const result = H.doTask(pet, target.dataset.value, localDay(now));
    if (!result.changed) return;
    startTrip(nextCity(), result.pet, renderedScene.city, now);
  }

  const actions = {
    species: (target) => {
      const label = target.getAttribute('aria-label');
      changeChoice();
      controls.querySelector(`[aria-label="${label}"]`).focus();
    },
    'edit-pet': () => {
      choosing = true;
      selectedSpecies = pet.species;
      draftName = pet.name;
      render(true);
    },
    'cancel-choice': () => { choosing = false; render(true); },
    intro: () => startTrip(nextCity()),
    depart: () => startTrip(nextCity()),
    'answer-call': () => {
      savePet({ ...pet, arrival: { ...pet.arrival, answered: true } });
      render(true);
    },
    'next-line': advanceSpeech,
    'complete-care': completeCare,
    'care-options': () => openSheet('care'),
    'pick-care': (target) => {
      const task = H.TASKS.find((item) => item.id === target.dataset.value);
      const result = H.chooseCare(pet, task.focus, localDay(), task.id);
      if (result.changed) savePet(result.pet);
      closeSheet();
      render();
      controls.querySelector('.task-pill')?.focus();
    },
    diary: () => openSheet('diary'),
    route: () => openSheet('route'),
    destinations: () => openSheet('destinations'),
    passport: () => openSheet('passport'),
    'close-sheet': closeSheet,
    postcard: (target) => { cardId = target.dataset.value; openSheet('postcard'); },
    quiz: () => openSheet('quiz'),
    answer: (target) => {
      const result = H.answerQuiz(pet, cardId, Number(target.dataset.value), cities);
      savePet(result.pet);
      openSheet('quiz');
    },
    wish: (target) => {
      const id = selectedCard().cityId;
      savePet(H.toggleWish(pet, id));
      target.setAttribute('aria-pressed', String(pet.wish.includes(id)));
    },
    share: () => share(selectedCard()),
    'guest-share': () => {
      openSheet('share');
      if (pet.postcards.length) share(pet.postcards[0]);
    },
    'guest-card': () => openSheet('guest-card'),
    accelerate: () => {
      if (!checkMode || !pet.trip) return;
      savePet({ ...pet, trip: { ...pet.trip, returnAt: Date.now() } });
      checkReturn();
    },
    reset: () => {
      if (!window.confirm('Сбросить питомца, дела, поездки и открытки?')) return;
      clearTimeout(returnTimer);
      clearTimeout(journeyTimer);
      savePet(null);
      cheeringAt = null;
      selectedSpecies = 'cat';
      draftName = species.cat[1];
      choosing = false;
      render(true);
    },
  };

  function setMenu(open) {
    menuOpen = open;
    renderMenu();
    scheduleSpeech();
  }

  menuButton.addEventListener('click', () => setMenu(!menuOpen));
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (menuOpen && !menuButton.contains(event.target) && (!menu.contains(event.target) || target)) {
      setMenu(false);
    }
    if (target && !target.disabled) actions[target.dataset.action]?.(target);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuOpen) {
      setMenu(false);
      menuButton.focus();
    }
    if (renderedScene.mode === 'choose' && ['ArrowLeft', 'ArrowRight'].includes(event.key)
        && !event.target.closest('input')) {
      event.preventDefault();
      changeChoice();
      controls.querySelector('h1').focus({ preventScroll: true });
    }
  });

  sheet.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeSheet();
  });
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) closeSheet();
  });

  document.addEventListener('change', (event) => {
    if (event.target.id !== 'child-mode') return;
    child = event.target.checked;
    store(childKey, child ? '1' : '0');
    render();
    menu.querySelector('#child-mode')?.focus();
  });

  controls.addEventListener('input', (event) => {
    if (event.target.id !== 'pet-name') return;
    draftName = event.target.value;
    event.target.setCustomValidity('');
  });

  controls.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.target.elements['pet-name'];
    if (!input.value.trim()) {
      input.setCustomValidity('Введи имя питомца.');
      input.reportValidity();
      return;
    }
    const profile = H.newPet({ name: input.value, species: selectedSpecies, color: pet?.color });
    savePet(choosing ? { ...pet, name: profile.name, species: profile.species } : profile);
    choosing = false;
    render(true);
  });

  content.addEventListener('submit', (event) => {
    if (event.target.id !== 'destination-form') return;
    event.preventDefault();
    savePet({ ...pet, nextStopId: event.target.elements.city.value });
    closeSheet();
    render(true);
  });

  const gestureDirection = { choose: 'side', care: 'up', diary: 'up', sheet: 'down' };
  let drag;
  let swipeButton;
  let swipeEnd = 0;
  document.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const handle = event.target.closest('[data-gesture], .sheet-top');
    const type = handle?.dataset.gesture ?? (handle ? 'sheet' :
      renderedScene.mode === 'choose' && !event.target.closest('button, input') ? 'choose' : '');
    if (!type) return;
    drag = { handle, type, id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  document.addEventListener('pointerup', (event) => {
    if (drag?.id !== event.pointerId) return;
    const { handle, type, x, y } = drag;
    drag = null;
    if (!petAnimation.isSwipe(gestureDirection[type], event.clientX - x, event.clientY - y)) return;
    swipeButton = handle?.closest('button');
    swipeEnd = performance.now();
    if (type === 'choose') changeChoice();
    if (type === 'care' && handle.isConnected) completeCare(handle);
    if (type === 'diary') openSheet('diary');
    if (type === 'sheet') closeSheet();
  });
  document.addEventListener('pointercancel', () => { drag = null; });
  document.addEventListener('click', (event) => {
    if (event.detail && swipeButton?.contains(event.target) && performance.now() - swipeEnd < 350) {
      event.preventDefault();
      event.stopImmediatePropagation();
      swipeButton = null;
    }
  }, true);

  if (!guestMode) restore();
  reducedMotion.addEventListener('change', () => {
    const line = lines[lineIndex];
    if (line && reducedMotion.matches) speak(line, false);
    updateRoute();
  });
  window.addEventListener('focus', refreshClock);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshClock();
    scheduleSpeech();
  });
  setInterval(refreshClock, 15000);
  if (!checkReturn()) render();
})();
