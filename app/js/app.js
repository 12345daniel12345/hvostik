(function () {
  'use strict';

  const H = window.Hvostik;
  const petAnimation = window.HVPet;
  const cities = window.HV_CITIES;
  const openCities = cities.filter((city) => city.проверено !== false);
  const videos = window.HV_VIDEOS || {};
  const mapData = window.HVMap;
  const homeCity = { id: H.HOME_CITY_ID, name: mapData.home.name, coordinates: mapData.home };
  const mapCities = [homeCity, ...cities];
  const mapLine = 'Выбирай! Я уже собрал рюкзак.';
  const voice = window.HVVoice ?? { supported: false, enabled: false, say() {}, stop() {}, duration: () => 0, setEnabled() {} };
  let vibratedFor = null;
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
  let selectedCityId;
  let overviewMap;
  let menuOpen = false;
  let returnTimer;
  let routeTimer;
  let renderedDay;
  let renderedLight;
  let renderedScene;
  let speechKey;
  let lines = [];
  let lineIndex = 0;
  let speechTimer;
  let typingTimer;
  let nextSpeechAt;
  let introIndex = 0;
  let greeting = false;
  let greetingPending = false;
  let wasAway = false;

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
      document.documentElement.dataset.child = String(child);
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
    <img src="img/${file}.webp?v=4" alt="${escapeHtml(alt)}"><figcaption>Иллюстрация</figcaption>
  </figure>`;

  function nextCity() {
    const from = H.currentCityId(pet);
    const wished = openCities.find((city) => city.id === pet.nextStopId && city.id !== from);
    return wished ?? openCities[(openCities.findIndex((city) => city.id === from) + 1) % openCities.length];
  }

  function restingPhoto(animal, city) {
    // У кота пока нет своего кадра для каждой остановки: вместо старого рыжего кота — британец из дороги.
    const away = animal === 'cat' ? 'live/cat-train' : `${animal}-away`;
    return city ? petPostcards[animal]?.[city.id] ?? away : `${animal}-home`;
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
    if (!pet.introSeen) return { mode: 'intro', file: `${pet.species}-home` };
    if (pet.trip) {
      const city = cityById(pet.trip.cityId);
      const night = pet.trip.kind === 'care' && renderedLight === 'night';
      const file = `live/${pet.species === 'dog' ? 'dog' : 'cat'}-${night ? 'night' : 'train'}`;
      return { mode: night ? 'night' : 'trip', city, file };
    }
    const card = arrivalCard();
    const city = cityById(H.currentCityId(pet));
    if (card && !pet.arrival.answered) return stopScene('call', city);
    const care = H.careForDay(pet, renderedDay);
    if (pet.introDone && care?.done && !care.tripUsed) {
      return city ? stopScene('joy', city) : { mode: 'joy', file: `${pet.species}-home` };
    }
    if (card && !pet.arrival.storySeen) return stopScene('story', city);
    return { mode: 'home', city, file: restingPhoto(pet.species, city) };
  }

  function heading(text, context = '') {
    return `<header class="scene-heading glass">${context ? `<p>${context}</p>` : ''}
      <h1 id="scene-title" tabindex="-1">${text}</h1></header>`;
  }

  const subtitle = () => `<div class="subtitle glass" id="subtitle" hidden>
    <span id="subtitle-text" aria-hidden="true"></span><span class="sr-only" id="subtitle-live" aria-live="polite"></span>
  </div>`;

  // Лапка-вызов (27.11.2026): нажал — питомец откликается и говорит, где он сейчас.
  function pawCall() {
    return `<button class="paw-call glass" type="button" data-action="summon" aria-label="Позвать питомца">
      <svg aria-hidden="true" viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5" ry="4.2"/><circle cx="5.6" cy="10.6" r="2.2"/>
      <circle cx="9.4" cy="6.6" r="2.2"/><circle cx="14.6" cy="6.6" r="2.2"/><circle cx="18.4" cy="10.6" r="2.2"/></svg></button>`;
  }

  function whereAmI() {
    const trip = pet.trip;
    const city = cityById(trip.cityId);
    const fromName = `из ${genitive(cityById(trip.fromCityId)?.name ?? 'Москва')}`;
    if (renderedScene.mode === 'night') return `Сплю в дороге. Завтра — следующая остановка: ${city.name}.`;
    const share = Math.max(0, Math.min(1, (Date.now() - trip.startedAt) / (trip.returnAt - trip.startedAt)));
    return `Я тут! Еду ${fromName} в ${accusative(city.name)}, проехали ${Math.round(share * 100)}%. Позвоню около ${timeFormat.format(trip.returnAt)}.`;
  }

  const genitiveNames = { 'Тула': 'Тулы', 'Ярославль': 'Ярославля', 'Москва': 'Москвы' };
  const genitive = (name) => genitiveNames[name] ?? name;
  const accusativeNames = { 'Тула': 'Тулу', 'Москва': 'Москву' };
  const accusative = (name) => accusativeNames[name] ?? name;
  const cityPlaces = {
    tula: 'Туле', kazan: 'Казани', baikal: 'на Байкале', 'veliky-ustyug': 'Великом Устюге',
    spb: 'Санкт-Петербурге', murmansk: 'Мурманске', sochi: 'Сочи', suzdal: 'Суздале',
    yaroslavl: 'Ярославле', kaliningrad: 'Калининграде', vladivostok: 'Владивостоке', novosibirsk: 'Новосибирске',
  };

  function summonPet() {
    if (!pet?.trip) return;
    greeting = false;
    petAnimation.react(art);
    clearTimeout(speechTimer);
    speak(whereAmI());
    scheduleSpeech();
  }

  function diaryHandle() {
    return `<button class="diary-handle" type="button" data-action="diary" data-gesture="diary"
      aria-label="Открыть дневник" aria-haspopup="dialog"><span aria-hidden="true"></span>Дневник</button>`;
  }

  function choiceView() {
    const [label] = species[selectedSpecies];
    return `${heading('Выбери попутчика', label)}
      <form id="adopt" class="scene-bottom">
        <div class="species-switch" role="group" aria-label="Выбор питомца">
          ${button('‹', 'species', 'aria-label="Предыдущий питомец"', 'round')}
          <span>Листай влево или вправо</span>
          ${button('›', 'species', 'aria-label="Следующий питомец"', 'round')}
        </div>
        <label class="name-field glass" for="pet-name"><span>Имя питомца</span>
          <input id="pet-name" name="pet-name" maxlength="20" required autocomplete="off" value="${escapeHtml(draftName)}">
        </label>
        <button class="button primary" type="submit">Это мой попутчик</button>
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
    if (mode === 'intro') {
      return `${heading(name, 'Дома')}<div class="scene-bottom">${subtitle()}
        ${button(introIndex === 4 ? 'Открыть карту' : 'Дальше', 'advance-intro', '', 'primary')}
        ${introIndex === 4 ? '' : button('Пропустить', 'finish-intro', '', 'text-button intro-skip')}</div>`;
    }
    if (mode === 'call') {
      return `${heading(`${name} · ${city.name}`, 'Входящий звонок')}<div class="scene-bottom call-bottom">
        <button class="button primary answer-call" type="button" data-action="answer-call" aria-label="Ответить">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M6.5 3.5 9 7.8l-2.1 2.1a14 14 0 0 0 7.2 7.2l2.1-2.1 4.3 2.5-1.1 3.1c-.2.5-.7.9-1.3.9A17.6 17.6 0 0 1 2.5 5.9c0-.6.4-1.1.9-1.3z" fill="currentColor"/></svg>
        </button><span class="call-label" aria-hidden="true">Ответить</span></div>`;
    }
    if (mode === 'trip' || mode === 'night') {
      return `${heading(name, mode === 'trip' ? 'В дороге' : 'В дороге · ночь')}
        <div class="scene-bottom">${subtitle()}${routeThread(city)}</div>${pawCall()}${diaryHandle()}`;
    }
    return `${heading(city?.name ?? name, city ? 'На остановке' : 'Дома')}
      <div class="scene-bottom">${subtitle()}
        ${mode === 'story' ? unverified(city) : ''}
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

  function taskTransition(city) {
    const { task, text } = taskFor(city);
    const label = (text || task[pet.species]).replace(/^./u, (first) => first.toLowerCase()).replace(/[.!?]$/, '');
    return `Чтобы ехать дальше, сделай для себя одно дело. Здесь подходит: ${label}.`;
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
    const care = H.careForDay(pet, renderedDay);
    facts.push(care?.tripUsed ? 'Завтра — следующая остановка.' : taskTransition(city));
    return facts.filter(Boolean);
  }

  function introLines() {
    const dog = pet.species === 'dog';
    return [
      `Спасибо, что выбрал меня! Меня зовут ${pet.name}.`,
      `Я — ${dog ? 'пёс' : 'кот'}-путешественник: катаюсь по настоящим городам России и рассказываю, чем они интересны.`,
      `${dog ? 'Мои лапы сами не побегут.' : 'Сам я в дорогу не соберусь.'} Мой билет — твоё маленькое полезное дело: стакан воды, прогулка, спокойный чай.`,
      'Одно дело в день — один переезд. Ничего не теряется, даже если ты пропустишь день.',
      'А первую поездку я дарю. Посмотри на карту и выбери, куда меня отправить!',
    ];
  }

  function tripLine(city) {
    const destination = accusative(city.name);
    if (pet.trip.kind === 'intro') return `Еду в ${destination}! Первую дорогу проеду быстро — позвоню через минуту.`;
    const time = timeFormat.format(pet.trip.returnAt);
    return H.careForDay(pet, renderedDay)?.done
      ? `Я в пути. Позвоню около ${time}. Завтра — новое дело и новая дорога.`
      : `Еду в ${destination}. Позвоню около ${time}.`;
  }

  function welcomeLine({ mode, city }) {
    if (mode === 'trip' || mode === 'night') return `Я ещё в дороге в ${accusative(city.name)}.`;
    if (!['home', 'story', 'joy'].includes(mode)) return '';
    if (!city) return 'Я дома и жду, куда поедем.';
    const place = cityPlaces[city.id] ?? city.name;
    return `С возвращением! Я ${city.id === 'baikal' ? place : `в ${place}`}.`;
  }

  function clearSpeech() {
    clearTimeout(speechTimer);
    clearInterval(typingTimer);
  }

  function speak(line, animate = true, audible = true) {
    clearInterval(typingTimer);
    const box = controls.querySelector('#subtitle');
    if (!box) return;
    const text = typeof line === 'string' ? line : line.text;
    if (line.joke) savePet({ ...pet, jokeDay: localDay() });
    box.hidden = false;
    const visible = box.querySelector('#subtitle-text');
    box.querySelector('#subtitle-live').textContent = text;
    const duration = voice.duration(text);
    nextSpeechAt = performance.now() + Math.max(5000, duration);
    if (audible && !sheet.open && !menuOpen && !document.hidden) {
      voice.say(text, guestMode ? guest?.species : pet?.species, { child });
      petAnimation.talk?.(art, duration || text.split(' ').length * 380);
    }
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
    if (sheet.open || menuOpen || document.hidden || renderedScene.mode === 'intro') return;
    if (greeting || renderedScene.mode === 'story' || lines.length > 1) {
      speechTimer = setTimeout(advanceWhenQuiet, Math.max(0, nextSpeechAt - performance.now()));
    }
  }

  function advanceWhenQuiet() {
    if (voice.speaking) {
      speechTimer = setTimeout(advanceWhenQuiet, 200);
      return;
    }
    advanceSpeech();
  }

  function advanceSpeech() {
    if (greeting) {
      greeting = false;
      setupSpeech(renderedScene);
      return;
    }
    if (renderedScene.mode === 'intro') {
      advanceIntro();
      return;
    }
    if (renderedScene.mode === 'story' && lineIndex === lines.length - 1) {
      savePet({ ...pet, arrival: { ...pet.arrival, storySeen: true } });
      const tap = art.querySelector('[data-action="next-line"]');
      const wasFocused = document.activeElement === tap;
      render(false, false, true);
      if (wasFocused) (controls.querySelector('#scene-action button') ?? controls.querySelector('h1')).focus();
      return;
    }
    if (lines.length < 2) return;
    lineIndex = (lineIndex + 1) % lines.length;
    speak(lines[lineIndex]);
    scheduleSpeech();
  }

  function openCityButton() {
    const label = pet.introDone ? 'Выбрать город' : 'Открыть карту';
    return button(label, 'open-city-map', 'aria-haspopup="dialog"', 'primary');
  }

  function revealNextStep({ mode, city }) {
    if (mode !== 'home' && mode !== 'joy') return;
    const care = H.careForDay(pet, localDay());
    if (!pet.introDone || (care?.done && !care.tripUsed)) {
      const slot = controls.querySelector('#scene-action');
      slot.innerHTML = openCityButton();
      slot.hidden = false;
    } else if (!care?.tripUsed) {
      renderTask(city);
    }
  }

  function setupSpeech(state, returning = false, keepSubtitle = false) {
    clearSpeech();
    greeting = false;
    const key = `${state.mode}/${state.city?.id ?? ''}/${arrivalCard()?.id ?? ''}/${child}/${renderedDay}`;
    if (key !== speechKey) {
      speechKey = key;
      lineIndex = 0;
      const { mode, city } = state;
      lines = ({
        intro: introLines,
        home: () => [!pet.introDone ? 'Я дома и жду, куда поедем.'
          : H.careForDay(pet, renderedDay)?.tripUsed ? 'Завтра — следующая остановка.' : taskTransition(city)],
        trip: () => [tripLine(city)],
        night: () => ['Завтра — следующая остановка.'],
        story: () => storyLines(city),
        joy: () => ['Спасибо! Это и есть мой билет. Куда дальше?'],
        guest: () => guest ? [city.tagline, city.fact] : [],
      }[mode] ?? (() => []))();
    } else if (state.mode === 'home' && pet.introDone && !H.careForDay(pet, renderedDay)?.tripUsed) {
      lines = [taskTransition(state.city)];
    }
    if (state.mode === 'intro') lineIndex = introIndex;
    const welcome = returning && welcomeLine(state);
    if (welcome) {
      greeting = welcome !== lines[lineIndex];
      speak(welcome, false);
    } else if (lines.length) {
      speak(lines[lineIndex], state.mode !== 'intro' && !keepSubtitle, !keepSubtitle);
    } else {
      voice.stop();
    }
    revealNextStep(state);
    const tap = art.querySelector('[data-action="next-line"]');
    if (tap) {
      tap.hidden = lines.length < 2;
      tap.setAttribute('aria-label', state.mode === 'intro' && introIndex === lines.length - 1 ? 'Открыть карту' : 'Следующая реплика');
    }
    scheduleSpeech();
  }

  function renderMenu() {
    menu.hidden = !menuOpen;
    menuButton.setAttribute('aria-expanded', String(menuOpen));
    if (!menuOpen) return;
    menu.innerHTML = `${button('Выбор питомца', 'edit-pet')}
      <label><input type="checkbox" id="child-mode" ${child ? 'checked' : ''}>Детский режим</label>
      ${voice.supported ? `<label><input type="checkbox" id="voice-mode" ${voice.enabled ? 'checked' : ''}>Голос питомца</label>` : ''}
      ${button('В гости', 'guest-share')}
      ${checkMode && pet?.trip ? button('Для проверки: ускорить прибытие', 'accelerate') : ''}
      ${button('Сбросить питомца', 'reset', '', 'reset')}`;
  }

  function render(focusHeading = false, returning = false, keepSubtitle = false) {
    renderedDay = localDay();
    renderedLight = lightAt(new Date().getHours());
    const state = scene();
    screen.dataset.scene = state.mode;
    screen.dataset.light = renderedLight;
    if (art.dataset.photo !== state.file) {
      petAnimation.mount(art, state.file);
      art.dataset.photo = state.file;
    }
    art.dataset.fur = pet?.color ?? '';
    renderedScene = state;
    controls.innerHTML = sceneView(state);
    if (state.mode === 'call' && vibratedFor !== arrivalCard()?.id) {
      vibratedFor = arrivalCard()?.id;
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([260, 140, 260, 140, 260]);
    }
    setupSpeech(state, returning, keepSubtitle);
    menuButton.hidden = guestMode || !pet || choosing;
    renderMenu();
    updateRoute();
    if (focusHeading && !sheet.open) controls.querySelector('h1')?.focus({ preventScroll: true });
  }

  function startTrip(cityId) {
    const now = new Date();
    const today = localDay(now);
    if (!cityId || !H.canStartTrip(pet, cityId, cities, today).ok) return;
    const next = H.startTrip(pet, cityId, cities, now.getTime(), today);
    savePet({ ...next, arrival: null, nextStopId: null });
    greetingPending = false;
    closeSheet();
    render(true);
    checkReturn();
  }

  function finishIntro() {
    if (renderedScene.mode !== 'intro') return;
    savePet(H.seeIntro(pet));
    openCityMap();
    render();
  }

  function advanceIntro() {
    if (introIndex === lines.length - 1) {
      finishIntro();
      return;
    }
    introIndex += 1;
    lineIndex = introIndex;
    speak(lines[lineIndex], false);
    if (introIndex === lines.length - 1) {
      controls.querySelector('[data-action="advance-intro"]').textContent = 'Открыть карту';
      controls.querySelector('.intro-skip')?.remove();
      art.querySelector('.scene-tap').setAttribute('aria-label', 'Открыть карту');
    }
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
    if (checkReturn()) return true;
    if (!guestMode && (renderedDay !== localDay() || renderedLight !== lightAt(new Date().getHours()))) {
      render();
      if (sheetView === 'city-choice') {
        if (canChooseCity()) updateCityCard();
        else closeSheet();
      }
    }
    updateRoute();
    return false;
  }

  function greetOnReturn() {
    if (sheet.open || menuOpen || document.hidden) return;
    greetingPending = false;
    if (welcomeLine(renderedScene)) setupSpeech(renderedScene, true);
    else scheduleSpeech();
  }

  function onReturn() {
    if (document.hidden) return;
    const arrived = refreshClock();
    if (!wasAway) return;
    wasAway = false;
    if (!arrived) {
      greetingPending = true;
      greetOnReturn();
    }
  }

  function changeChoice() {
    const next = selectedSpecies === 'cat' ? 'dog' : 'cat';
    if (!draftName.trim() || draftName === species[selectedSpecies][1]) draftName = species[next][1];
    selectedSpecies = next;
    render();
  }

  function routeMap(city) {
    const fromId = pet.trip.fromCityId ?? 'moscow';
    const detailed = window.HVRouteMap.render(fromId, city.id);
    if (detailed) return detailed;

    const origin = cityById(fromId) ?? homeCity;
    const originName = origin.name;
    const home = origin.coordinates;
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
    // Аудит 27.11: карта приближается к самому маршруту, а не показывает всю Россию.
    const [, , fullW, fullH] = mapData.viewBox.split(' ').map(Number);
    const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y, controlY), maxY = Math.max(start.y, end.y);
    const pad = Math.max(55, separation * 0.45);
    let boxW = Math.max(240, maxX - minX + pad * 2), boxH = Math.max(maxY - minY + pad * 2, boxW * fullH / fullW);
    boxW = Math.max(boxW, boxH * fullW / fullH);
    const boxX = Math.max(0, Math.min(fullW - boxW, (minX + maxX) / 2 - boxW / 2));
    const boxY = Math.max(0, Math.min(fullH - boxH, (minY + maxY) / 2 - boxH / 2));
    const k = Math.min(1, boxW / fullW) * 1.5;
    const viewBox = `${boxX.toFixed(1)} ${boxY.toFixed(1)} ${boxW.toFixed(1)} ${boxH.toFixed(1)}`;
    const label = (point, name, toLeft) => {
      const { x, y, side } = anchors(point, toLeft);
      return `<text x="${x}" y="${y}" text-anchor="${side}">${name}</text>`;
    };
    return `${title(`${originName} → ${city.name}`)}
      <div class="route-meta"><span>${window.HVRouteMap.tripDistance(origin, city)}</span>
      <span class="route-percent" data-route-percent role="progressbar" aria-label="Пройдено" aria-valuenow="0">0%</span></div>
      <svg class="route-map" viewBox="${viewBox}" role="img" aria-label="${originName} → ${city.name}, по прямой">
        <path class="russia-shape" fill-rule="evenodd" d="${mapData.shape}"></path>
        ${openCities.filter((item) => item.id !== city.id && item.id !== origin?.id).map((item) => {
          const point = mapData.project(item.coordinates.lon, item.coordinates.lat);
          return `<circle class="map-other-city" cx="${point.x}" cy="${point.y}" r="${(4 * k).toFixed(2)}"><title>${item.name}</title></circle>`;
        }).join('')}
        <path class="route-base" d="${route}"></path>
        <path class="route-progress" d="${route}"></path>
        <g class="map-home" transform="translate(${start.x} ${start.y}) scale(${k})"><circle r="9"></circle>
          ${label(start, originName, start.x <= end.x)}</g>
        <g class="map-destination" transform="translate(${end.x} ${end.y}) scale(${k})"><circle class="destination-ring" r="19"></circle>
          <circle r="8"></circle>${label(end, city.name, start.x > end.x)}</g>
        <g class="route-marker" transform="translate(${start.x} ${start.y})"><g transform="scale(${k})"><circle r="12"></circle></g></g>
      </svg>
      <p class="muted">Карта: Natural Earth · города: © участники OpenStreetMap</p>`;
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
      path.toggleAttribute('data-at-start', progress === 0);
      content.querySelector('.route-marker').setAttribute('transform', `translate(${point.x} ${point.y})`);
      const percent = content.querySelector('[data-route-percent]');
      const rounded = Math.floor(progress * 100);
      percent.textContent = `${rounded}%`;
      percent.setAttribute('aria-valuenow', rounded);
      for (const stop of content.querySelectorAll('[data-route-stop]')) {
        stop.toggleAttribute('data-passed', progress >= Number(stop.dataset.routeStop));
      }
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
          <img src="img/${photoFor(city, pet.species)}.webp?v=4" alt="" loading="lazy">
          <span>${city.name}</span><small>Иллюстрация</small></button>`;
      }).join('')}</div>` : '<p>Первая открытка появится после поездки.</p>'}
      <div class="sheet-row">${button('Паспорт', 'passport')}${button('Маршруты', 'destinations')}</div>`;
  }

  function canChooseCity() {
    return ['home', 'joy'].includes(renderedScene.mode)
      && openCities.some((city) => H.canStartTrip(pet, city.id, cities, localDay()).ok);
  }

  function destinationsView() {
    const passport = H.passport(pet, openCities);
    return `${title('Маршруты')}${button('‹ Дневник', 'diary', '', 'text-button')}
      ${pet.trip ? button('Карта поездки', 'route') : ''}
      <div class="route-list">${passport.routes.map((route) => `<div class="route-label">
        <label>${route.name}<progress value="${route.done}" max="${route.total}"></progress></label>
        <small>${route.done} / ${route.total}</small></div>`).join('')}</div>
      ${canChooseCity() ? openCityButton() : ''}`;
  }

  function cityChoiceCard() {
    const city = mapCities.find(({ id }) => id === selectedCityId);
    if (!city) return '<p class="map-card-hint">Коснись города, чтобы посмотреть, куда можно поехать.</p>';
    const name = `<h3>${city.name}</h3>`;
    if (city.id === homeCity.id) return `${name}<p>Дом питомца</p>`;
    const current = city.id === H.currentCityId(pet);
    const check = H.canStartTrip(pet, city.id, cities, localDay());
    if (city.проверено === false) return `${name}<p>${current ? 'Я здесь · ' : ''}Этот город ещё готовим</p>`;
    const from = cityById(H.currentCityId(pet)) ?? homeCity;
    return `${name}<p>${city.tagline}</p>
      <p class="map-distance">${current ? 'Я здесь' : window.HVRouteMap.tripDistance(from, city)}</p>
      ${check.ok ? button(`Отправить в ${accusative(city.name)}`, 'send-to-city', '', 'primary') : ''}`;
  }

  function cityChoiceView() {
    const { markers, width, height, background } = window.HVRouteMap.choiceMap(mapCities, overviewMap);
    const suggested = nextCity()?.id;
    const from = H.currentCityId(pet);
    const at = (x, y) => `left:${100 * x / width}%;top:${100 * y / height}%`;
    return `<header class="city-map-heading">
        ${title('Куда поедем?')}<p>${mapLine}</p>
      </header>
      <div class="city-map-views" role="group" aria-label="Область карты">
        ${button('Центр России', 'map-region', `data-value="central" aria-pressed="${!overviewMap}"`)}
        ${button('Вся Россия', 'map-region', `data-value="overview" aria-pressed="${overviewMap}"`)}
      </div>
      <div class="city-map-canvas route-map-frame"><div class="city-map-stage" role="group" aria-label="Города на карте">
        ${background}
        ${markers.map(({ city, point, label }) => {
          const home = city.id === homeCity.id;
          const region = home && overviewMap;
          const current = !home && city.id === from;
          const visited = pet.visited.includes(city.id);
          const closed = city.проверено === false;
          const action = region ? 'map-region' : 'select-city';
          const value = region ? 'central' : city.id;
          const name = region ? 'Центр России' : city.name;
          const status = [current ? 'Я здесь' : '', closed ? 'скоро' : ''].filter(Boolean).join(' · ');
          const labelText = [name, status, visited ? 'посещён' : '', home && !region ? 'дом питомца' : ''].filter(Boolean).join(', ');
          const active = selectedCityId === city.id;
          const kind = home ? 'home' : closed ? 'closed' : 'open';
          const hint = !selectedCityId && suggested === city.id ? ' data-suggested' : '';
          return `<button class="city-point" type="button" style="${at(point.x, point.y)}"
              data-action="${action}" data-value="${value}" data-kind="${kind}"${hint} tabindex="-1" aria-hidden="true">
              ${home ? '<svg viewBox="0 0 12 12" aria-hidden="true"><path class="map-house" d="M1.3 5.8 6 1.8l4.7 4 M2.8 5v5.2h6.4V5 M6 10.2V7.8"/></svg>' : '<span></span>'}
            </button>
            <button class="city-label" type="button" style="${at(...(label ?? [point.x, point.y]))}"
              data-action="${action}" data-value="${value}" data-kind="${kind}"
              ${region ? '' : `aria-pressed="${active}"`} aria-label="${labelText}">
              ${name}${visited ? ' <span class="city-stamp" aria-hidden="true">✓</span>' : ''}
              ${status ? `<small>${status}</small>` : ''}
            </button>`;
        }).join('')}
      </div></div>
      <p class="route-credit city-map-credit">Natural Earth · © участники OpenStreetMap</p>
      <section class="city-card glass" id="city-card" aria-live="polite">${cityChoiceCard()}</section>`;
  }

  function updateCityCard() {
    const card = content.querySelector('#city-card');
    card.innerHTML = cityChoiceCard();
    for (const label of content.querySelectorAll('.city-label[data-action="select-city"]')) {
      label.setAttribute('aria-pressed', String(label.dataset.value === selectedCityId));
    }
    content.querySelector('[data-suggested]')?.removeAttribute('data-suggested');
  }

  function openCityMap() {
    selectedCityId = null;
    overviewMap = false;
    openSheet('city-choice');
    voice.say(mapLine, pet.species, { child });
  }

  function postcardMedia(city, animal) {
    const file = photoFor(city, animal);
    const video = videos[animal]?.[city.id];
    return video ? `<figure class="sheet-photo">
      <video controls playsinline muted preload="metadata" poster="img/${file}.webp?v=4" aria-label="ИИ-видео: ${city.name}">
        <source src="video/${video}.mp4" type="video/mp4"></video><figcaption>ИИ-видео</figcaption>
      </figure>` : figure(file, city.name);
  }

  function postcardView(card, visitor = false) {
    const city = cityById(card.cityId);
    return `${title(city.name)}${visitor ? '' : button('‹ Дневник', 'diary', '', 'text-button')}
      ${postcardMedia(city, visitor ? guest.species : pet.species)}
      <div class="postcard-facts"><ul>${(child ? city.known.slice(0, 1) : city.known).map((fact) => `<li>${fact}</li>`).join('')}</ul>
        <p>${city.fact}</p>${city.food ? `<p><strong>Что попробовать</strong> ${city.food}</p>` : ''}
        <p><strong>Когда поехать</strong> ${city.when}</p>${unverified(city)}</div>
      <p class="postcard-letter">«${window.HV_PHRASES[city.id]}»</p>
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
    const passport = H.passport(pet, openCities);
    return `${title('Паспорт')}${button('‹ Дневник', 'diary', '', 'text-button')}
      <p>Городов: ${openCities.filter((city) => pet.visited.includes(city.id)).length} из ${passport.total} · Знаний: ${passport.knowledgeCount}</p>
      <div class="stamps">${openCities.map((city) => {
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
      'city-choice': cityChoiceView,
      postcard: () => postcardView(selectedCard()), 'guest-card': () => postcardView(guest, true),
      quiz: quizView, passport: passportView, care: careView,
      share: () => `${title('В гости')}${pet.postcards.length ? shareField() : '<p>Ссылка появится после первой поездки.</p>'}`,
    };
    sheetView = view;
    sheet.dataset.view = view;
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
    voice.stop();
    if (!sheet.open) sheetReturnFocus = document.activeElement;
    renderSheet(view);
    if (!sheet.open) sheet.showModal();
    sheet.querySelector('h2').focus({ preventScroll: true });
    scheduleSpeech();
    updateRoute();
  }

  function closeSheet() {
    if (!sheet.open) return;
    if (sheetView === 'city-choice') voice.stop();
    sheet.close();
    sheetView = null;
    delete sheet.dataset.view;
    content.replaceChildren();
    const fallback = controls.querySelector('[data-action="open-city-map"], .diary-handle') ?? controls.querySelector('h1');
    (sheetReturnFocus?.isConnected && !sheetReturnFocus.closest('[hidden]') ? sheetReturnFocus : fallback)?.focus();
    if (greetingPending) greetOnReturn();
    else scheduleSpeech();
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
    const result = H.doTask(pet, target.dataset.value, localDay());
    if (!result.changed) return;
    savePet(result.pet);
    render(true);
    petAnimation.react(art);
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
    'advance-intro': advanceIntro,
    'finish-intro': finishIntro,
    'open-city-map': () => { if (canChooseCity()) openCityMap(); },
    'map-region': (target) => {
      const overview = target.dataset.value === 'overview';
      if (sheetView !== 'city-choice' || overview === overviewMap) return;
      overviewMap = overview;
      selectedCityId = null;
      renderSheet('city-choice');
      content.querySelector(`.city-map-views [data-value="${target.dataset.value}"]`)?.focus({ preventScroll: true });
    },
    'select-city': (target) => {
      if (sheetView !== 'city-choice') return;
      selectedCityId = target.dataset.value;
      updateCityCard();
      if (target.matches('.city-point')) content.querySelector(`.city-label[data-value="${selectedCityId}"]`)?.focus({ preventScroll: true });
    },
    'send-to-city': () => { if (sheetView === 'city-choice') startTrip(selectedCityId); },
    'answer-call': () => {
      savePet({ ...pet, arrival: { ...pet.arrival, answered: true } });
      render(true);
    },
    'next-line': advanceSpeech,
    summon: summonPet,
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
      savePet(null);
      introIndex = 0;
      selectedSpecies = 'cat';
      draftName = species.cat[1];
      choosing = false;
      render(true);
    },
  };

  function setMenu(open) {
    menuOpen = open;
    renderMenu();
    if (!open && greetingPending) greetOnReturn();
    else scheduleSpeech();
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
    if (event.target.id === 'voice-mode') {
      voice.setEnabled(event.target.checked);
      return;
    }
    if (event.target.id !== 'child-mode') return;
    child = event.target.checked;
    document.documentElement.dataset.child = String(child);
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
    if (reducedMotion.matches) {
      clearInterval(typingTimer);
      const live = controls.querySelector('#subtitle-live');
      if (live) controls.querySelector('#subtitle-text').textContent = live.textContent;
    }
    updateRoute();
  });
  window.addEventListener('blur', () => { wasAway = true; });
  window.addEventListener('focus', onReturn);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wasAway = true;
      clearTimeout(speechTimer);
      voice.stop();
    } else onReturn();
  });
  setInterval(refreshClock, 15000);
  if (!checkReturn()) render(false, Boolean(pet));
})();
