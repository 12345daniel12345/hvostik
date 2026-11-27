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
  const colors = { ginger: 'Рыжий', cream: 'Кремовый', smoke: 'Дымчатый', dark: 'Тёмный' };
  const cityPhotos = {
    tula: 'tula', kazan: 'kazan', baikal: 'baikal', 'veliky-ustyug': 'ustug',
    spb: 'spb', murmansk: 'murmansk', sochi: 'sochi', suzdal: 'suzdal',
    yaroslavl: 'yaroslavl', kaliningrad: 'kaliningrad', vladivostok: 'vladivostok',
    novosibirsk: 'novosibirsk',
  };
  const petPostcards = {
    cat: { tula: 'cat-tula', baikal: 'cat-baikal', 'veliky-ustyug': 'cat-ustug' },
    dog: { kazan: 'dog-kazan', spb: 'dog-spb' },
  };
  const timeFormat = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const screen = document.querySelector('#screen');
  const nav = document.querySelector('#navigation');
  const menu = document.querySelector('#menu');
  const menuButton = document.querySelector('#menu-button');
  const notice = document.querySelector('#storage-notice');

  let pet = null;
  let child = false;
  let current = 'choose';
  let passportTab = 'stamps';
  let cardId = null;
  let menuOpen = false;
  let carePickerOpen = false;
  let returnTimer;
  let routeTimer;
  let renderedDay;
  let renderedScreen;
  let selectedSpecies = 'cat';
  let selectedColor = 'ginger';
  let draftName = species.cat[1];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  function localDay(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

  function store(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      notice.hidden = false;
    }
  }

  function savePet(next) {
    pet = next;
    store(storageKey, JSON.stringify({ pet, 'cities-version': 2 }));
  }

  const heading = (title, label = '', details = '') => `<header class="heading">
    ${label ? `<p class="eyebrow">${label}</p>` : ''}
    <h1 tabindex="-1">${title}</h1>${details ? `<p>${details}</p>` : ''}
  </header>`;

  const button = (label, action, extra = '', kind = '') => `<button type="button"
    class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;

  const figure = (file, alt, imageClass = '', figureClass = 'scene') => `<figure class="${figureClass}">
    <img class="${imageClass}" src="img/${file}.webp" alt="${escapeHtml(alt)}">
    <figcaption>Иллюстрация</figcaption>
  </figure>`;

  function petPortrait(mode) {
    const name = escapeHtml(pet.name);
    const interactive = mode === 'home' || mode === 'return';
    return `<div class="pet-stage" data-pet-mode="${mode}">
      <div class="pet-travel" ${mode === 'trip' ? 'aria-hidden="true"' : ''}>
        ${interactive ? `<button type="button" class="pet-portrait" aria-label="Погладить питомца: ${name}">`
          : '<div class="pet-portrait">'}
          <span class="pet-hop"><span class="pet-tremor"><span class="pet-photo ${fur(pet.color)}">
            <img src="img/${pet.species}-home.webp" width="1050" height="700"
              alt="${mode === 'missed' ? name : ''}">
          </span></span></span>
        ${interactive ? '</button>' : '</div>'}
      </div>
    </div>`;
  }

  const portraitScene = (mode) => `<figure class="scene home-portrait">${petPortrait(mode)}<figcaption>Иллюстрация</figcaption></figure>`;

  function returnHeading(title, label) {
    return `<div class="pet-return-heading">${heading(title, label)}${portraitScene('return')}</div>`;
  }

  function cityPhoto(city, compact = false, animal = '') {
    const file = petPostcards[animal]?.[city.id] ?? cityPhotos[city.id];
    return file ? figure(file, city.name, '', compact ? '' : 'scene')
      : `<div class="${compact ? '' : 'scene'}"><div class="placeholder">${city.name}</div></div>`;
  }

  function travelMedia(city, animal) {
    const video = videos[animal]?.[city.id];
    if (video) {
      const poster = petPostcards[animal]?.[city.id] ?? cityPhotos[city.id];
      return `<figure class="travel-media video-postcard">
        <video controls playsinline preload="metadata" muted data-autoplay
          data-city="${city.id}" data-species="${animal}"
          ${poster ? `poster="img/${poster}.webp"` : ''} aria-label="ИИ-видео: ${escapeHtml(city.name)}">
          <source src="video/${video}.mp4" type="video/mp4">
        </video><figcaption>ИИ-видео</figcaption>
      </figure>`;
    }
    return `<div class="photo-postcard">${cityPhoto(city, false, animal)}
      <p class="media-note">Пока фото-иллюстрация. Здесь появится ИИ-видео питомца в этом городе.</p></div>`;
  }

  const unverified = (city) => city.проверено === false ? '<small class="verification">Факты проверяются</small>' : '';
  const fur = (color) => Object.hasOwn(colors, color) ? `fur-${color}` : '';
  const selectedCard = () => pet.postcards.find((card) => card.id === cardId);

  function choiceView() {
    return `${heading('Ты заботишься о себе. Он путешествует.', 'Хвостик',
      'Первая поездка — сразу. Открытки и знания уже здесь, живые ИИ-видео — следующий шаг.')}
      <form id="adopt" class="stack adopt-form">
        <div class="species">${Object.entries(species).map(([id, [label]]) => `
          <button class="pet-card" type="button" data-action="species" data-value="${id}"
            aria-label="${label}" aria-pressed="${selectedSpecies === id}">
            <span class="preview"><img src="img/${id}-home.webp" alt=""
              class="${id === selectedSpecies ? fur(selectedColor) : ''}"><span class="caption">Иллюстрация</span></span>
            <strong>${label}</strong>
          </button>`).join('')}</div>
        <div><label class="field-label" for="pet-name">Имя питомца</label>
          <input class="field" id="pet-name" name="pet-name" maxlength="20" required autocomplete="off"
            value="${escapeHtml(draftName)}"></div>
        <fieldset class="colors"><legend>Окрас</legend><div class="swatches">
          ${Object.entries(colors).map(([id, label]) => `<button type="button" class="swatch"
            data-action="color" data-color="${id}" aria-label="${label}" aria-pressed="${selectedColor === id}"></button>`).join('')}
        </div></fieldset>
        <p class="form-rule">Дальше: одно маленькое дело для себя = одна поездка.</p>
        <button class="button primary" type="submit">Забрать домой</button>
      </form>`;
  }

  function careChoices() {
    return `<div class="focus-list">${H.FOCUS.map((focus, index) => {
      const task = H.TASKS.find((item) => item.id === focus.taskId);
      return `<button type="button" class="focus-card" data-action="care" data-value="${focus.id}">
        <span class="focus-number">0${index + 1}</span><span><strong>${focus.label}</strong>
        <span>${task[pet.species]}</span></span><span class="focus-arrow" aria-hidden="true">→</span>
      </button>`;
    }).join('')}</div>`;
  }

  function missedDay(today) {
    return Boolean(pet.care?.dayKey && pet.care.dayKey < today && !pet.care.done);
  }

  function homeView() {
    const today = localDay();
    const name = escapeHtml(pet.name);
    const care = H.careForDay(pet, today);
    const missed = missedDay(today);
    const portrait = pet.trip ? figure(`${pet.species}-away`, pet.name, fur(pet.color))
      : portraitScene(missed ? 'missed' : 'home');
    const missedMessage = missed ? `<p class="missed-note">${pet.species === 'dog'
      ? 'Вчера не получилось. Ничего страшного — начнём с одного маленького дела.'
      : 'Вчера было как было. Сегодня достаточно одного маленького дела.'}</p>` : '';

    if (!pet.introDone) {
      return `${heading(name, 'Дома')}${portrait}
        <section class="rule-card"><p class="eyebrow">Первое путешествие</p><h2>Город ждёт</h2>
        <p>Первая поездка без дел и ожидания — просто посмотри, как это работает.</p>
        ${button('Выбрать первый город', 'map', '', 'primary')}</section>`;
    }

    if (pet.trip) {
      const city = H.findCity(cities, pet.trip.cityId);
      return `${heading(name, 'Дома')}${portrait}${missedMessage}
        <section class="rule-card"><p class="eyebrow">Путешествие продолжается</p><h2>${city.name}</h2>
        <p>Питомец вернётся с открыткой и знаниями о городе.</p>${button('Посмотреть поездку', 'trip', '', 'primary')}</section>`;
    }

    if (!care || carePickerOpen && !care.done) {
      return `${heading(name, 'Дома')}${portrait}${missedMessage}
        <section class="care-section"><p class="eyebrow">Забота о себе</p>
        <h2>Что тебе сегодня пригодится?</h2><p>Одно дело. Одна поездка. Без списка обязательств.</p>
        ${careChoices()}</section>`;
    }

    if (!care.done) {
      const task = H.TASKS.find((item) => item.id === care.taskId);
      return `${heading('Сегодня — для тебя', name)}${portrait}
        <section class="care-card"><p class="eyebrow">Твоё одно дело</p><h2>${task[pet.species]}</h2>
        <p>Не отчёт и не проверка. Просто маленький шаг для себя.</p>
        ${button('Дело сделано', 'complete-care', `data-value="${task.id}"`, 'primary')}
        ${button('Выбрать другое', 'care-options', '', 'text-button')}</section>`;
    }

    if (!care.tripUsed) {
      return `${heading('Дело сделано', name)}${portrait}
        <section class="rule-card"><p class="eyebrow">Теперь путешествие</p><h2>Выбери город</h2>
        <p>Ты сделал шаг для себя — питомец может отправиться в путь.</p>
        ${button('Выбрать город', 'map', '', 'primary')}</section>`;
    }

    return `${heading(name, 'Дома')}${portrait}
      <section class="quiet-card"><p class="eyebrow">День собран</p><h2>Дело сделано, город открыт</h2>
      <p>Новое дело и новый город появятся завтра.</p>
      ${pet.postcards.length ? button('Посмотреть последнюю открытку', 'latest-postcard', '', 'primary') : ''}</section>`;
  }

  function mapView() {
    const intro = !pet.introDone;
    const care = H.careForDay(pet, localDay());
    const details = intro ? 'Сразу, без дел и ожидания.'
      : care?.done && !care.tripUsed ? 'Дело сделано. Город ждёт.'
        : 'Сначала выбери и сделай одно дело для себя.';
    return `${heading(intro ? 'Куда отправимся первым?' : 'Куда поедем?', intro ? 'Первая поездка' : 'Направления', details)}
      ${!intro && (!care?.done || care.tripUsed) ? button('Вернуться к своему делу', 'home', '', 'secondary map-home') : ''}
      <div class="city-list">${cities.map((city) => {
        const check = H.canStartTrip(pet, city.id, cities, localDay());
        return `<article class="city ${check.ok ? '' : 'unavailable'}">
          ${cityPhoto(city, true, pet.species)}
          <div><h2>${city.name}</h2><p>${city.tagline}</p></div>
          ${button('Сюда', 'start', `data-value="${city.id}"
            aria-label="${escapeHtml(city.name + (check.ok ? '' : '. ' + check.reason))}"
            ${check.ok ? '' : 'disabled'}`, 'city-go')}
        </article>`;
      }).join('')}</div>`;
  }

  function routeDistance(home, city) {
    const radians = (value) => value * Math.PI / 180;
    const lat1 = radians(home.lat), lat2 = radians(city.lat);
    const dLat = lat2 - lat1, dLon = radians(city.lon - home.lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function routeDirection(home, city) {
    const latitude = city.lat - home.lat;
    const longitude = city.lon - home.lon;
    const vertical = latitude > 1 ? 'север' : latitude < -1 ? 'юг' : '';
    const horizontal = longitude > 3 ? 'восток' : longitude < -3 ? 'запад' : '';
    if (!vertical) return horizontal || 'рядом';
    if (!horizontal) return vertical;
    return `${vertical === 'север' ? 'северо' : 'юго'}-${horizontal}`;
  }

  function routeMap(city) {
    const home = mapData.home;
    const start = mapData.project(home.lon, home.lat);
    const end = mapData.project(city.coordinates.lon, city.coordinates.lat);
    const middleX = (start.x + end.x) / 2;
    const middleY = (start.y + end.y) / 2;
    const bend = Math.max(30, Math.min(85, Math.hypot(end.x - start.x, end.y - start.y) * 0.11));
    const controlX = middleX;
    const controlY = Math.max(30, middleY - bend);
    const route = `M${start.x.toFixed(1)},${start.y.toFixed(1)} Q${controlX.toFixed(1)},${controlY.toFixed(1)} ${end.x.toFixed(1)},${end.y.toFixed(1)}`;
    const close = Math.hypot(end.x - start.x, end.y - start.y) < 250;
    const eastward = end.x >= start.x;
    const homeLabelX = close ? (eastward ? -32 : 32) : 0;
    const homeLabelY = close ? 5 : 30;
    const homeAnchor = close ? (eastward ? 'end' : 'start') : 'middle';
    let destinationLabelX = close ? (eastward ? 32 : -32) : 0;
    let labelAnchor = close ? (eastward ? 'start' : 'end') : end.x > 850 ? 'end' : end.x < 150 ? 'start' : 'middle';
    let labelY = close ? 5 : (end.y < 65 ? 30 : -20);
    if (close && end.x < 150) {
      destinationLabelX = 0;
      labelAnchor = 'middle';
      labelY = end.y < 65 ? 30 : -26;
    }
    const distance = routeDistance(home, city.coordinates);
    return `<section class="route-card">
      <div class="route-meta"><div><p class="eyebrow">Маршрут по настоящей карте</p>
        <h2>Москва → ${city.name}</h2></div><span class="route-percent" data-route-percent>0%</span></div>
      <svg class="route-map" viewBox="${mapData.viewBox}" role="img"
        aria-label="Направление из Москвы в город ${escapeHtml(city.name)} по прямой">
        <path class="russia-shape" fill-rule="evenodd" d="${mapData.shape}"></path>
        ${cities.filter((item) => item.id !== city.id).map((item) => {
          const point = mapData.project(item.coordinates.lon, item.coordinates.lat);
          return `<circle class="map-other-city" cx="${point.x}" cy="${point.y}" r="4"><title>${item.name}</title></circle>`;
        }).join('')}
        <path class="route-base" d="${route}"></path>
        <path class="route-progress" d="${route}"></path>
        <g class="map-home" transform="translate(${start.x} ${start.y})"><circle r="9"></circle>
          <text x="${homeLabelX}" y="${homeLabelY}" text-anchor="${homeAnchor}">Москва</text></g>
        <g class="map-destination" transform="translate(${end.x} ${end.y})"><circle class="destination-ring" r="19"></circle>
          <circle class="destination-dot" r="8"></circle><text x="${destinationLabelX}" y="${labelY}" text-anchor="${labelAnchor}">${city.name}</text></g>
        <g class="route-marker" transform="translate(${start.x} ${start.y})"><circle class="marker-circle" r="26"></circle>
          <g class="marker-paw" transform="scale(1.2)"><ellipse cx="0" cy="5" rx="6" ry="5"></ellipse>
            <circle cx="-8" cy="-3" r="3"></circle><circle cx="-3" cy="-8" r="3"></circle>
            <circle cx="3" cy="-8" r="3"></circle><circle cx="8" cy="-3" r="3"></circle></g></g>
      </svg>
      <div class="route-facts"><span>≈ ${distance} км по прямой</span><span>Направление: ${routeDirection(home, city.coordinates)}</span></div>
      <p class="map-source">Дом условно в Москве. Карта: Natural Earth · точки: © участники OpenStreetMap.</p>
    </section>`;
  }

  function tripView() {
    const city = H.findCity(cities, pet.trip.cityId);
    const intro = pet.trip.kind === 'intro';
    return `${heading('В пути', city.name, intro
      ? 'Первая открытка — через несколько секунд.' : 'Питомец привезёт открытку и знания о городе.')}
      ${routeMap(city)}
      <div class="trip-status"><span class="trip-dot" aria-hidden="true"></span><strong>${intro
        ? `${escapeHtml(pet.name)} собирает первую открытку…` : `Вернётся в ${timeFormat.format(pet.trip.returnAt)}`}</strong></div>`;
  }

  function facts(city) {
    const known = child ? city.known.slice(0, 1) : city.known;
    return `<section class="info knowledge"><p class="eyebrow">Знания из поездки</p><h2>Чем знаменито это место</h2>
      <ul>${known.map((fact) => `<li>${fact}</li>`).join('')}</ul></section>
      ${child ? '' : `<section class="info"><h2>Ещё один факт</h2><p>${city.fact}</p></section>`}`;
  }

  function petLetter(city) {
    return `<section class="letter"><p class="eyebrow">Пишет питомец</p>
      <blockquote>«${window.HV_PHRASES[city.id]}»</blockquote></section>`;
  }

  function postcardView() {
    const card = selectedCard();
    const city = H.findCity(cities, card.cityId);
    const first = pet.postcards.length === 1 && card.id === pet.postcards[0].id && !pet.care;
    return `${returnHeading(city.name, 'Открытка')}${travelMedia(city, pet.species)}
      <div class="stack postcard-stack">
        ${petLetter(city)}${facts(city)}
        <div class="date-grid"><section class="info"><h2>Что попробовать</h2><p>${city.food}</p></section>
          <section class="info"><h2>Когда поехать</h2><p>${city.when}</p></section></div>
        ${unverified(city)}
        ${first ? `<section class="rule-card next-rule"><p class="eyebrow">Теперь по-настоящему</p>
          <h2>Одно дело для себя — одна поездка</h2><p>Без пяти галочек и баллов. Выбери то, что пригодится именно тебе.</p>
          ${button('Выбрать дело для себя', 'care-intro', '', 'primary')}</section>` : ''}
        ${button(card.answered ? 'Вернуться к угадайке' : 'Проверить, что запомнил', 'quiz', '', 'secondary')}
        <div class="postcard-actions">${button('Хочу сюда', 'wish', `aria-pressed="${pet.wish.includes(city.id)}"`, 'secondary')}
          ${button('В паспорт', 'collection', '', 'secondary')}</div>
        ${button('Отправить в гости', 'share', '', 'text-button')}
        <section class="info" id="share-box" hidden>
          <label for="guest-url" class="field-label">Ссылка «В гости»</label>
          <input class="field" id="guest-url" type="text" readonly>
          <p id="share-status" role="status"></p>
        </section>
      </div>`;
  }

  function quizView() {
    const card = selectedCard();
    const city = H.findCity(cities, card.cityId);
    return `${returnHeading('Один вопрос', city.name)}
      <section class="stack quiz-stack"><p class="quiz-intro">Не экзамен. Просто закрепим одно знание из открытки.</p>
      <h2>${city.quiz.question}</h2>
      ${card.answered ? `<div class="quiz-feedback" role="status">
        <strong>${card.correct ? 'Знание добавлено в паспорт.' : 'Теперь точно запомнишь.'}</strong>
        <p>Правильный ответ: ${city.quiz.options[city.quiz.correct]}</p>
      </div>${button('Вернуться к открытке', 'postcard', '', 'primary')}` : city.quiz.options.map((option, index) =>
        button(option, 'answer', `data-value="${index}"`)).join('')}
      ${card.answered ? '' : button('Не сейчас, к открытке', 'postcard', '', 'text-button')}</section>`;
  }

  function passportView() {
    const passport = H.passport(pet, cities);
    const wishes = passportTab === 'wish';
    const summary = `Городов: ${passport.visitedCount} из ${passport.total} · Знаний: ${passport.knowledgeCount}`;
    return `${heading('Паспорт', 'Коллекция', summary)}
      <div class="tabs" aria-label="Разделы паспорта" role="group">
        <button type="button" data-action="stamps" aria-pressed="${!wishes}">Штампы</button>
        <button type="button" data-action="wishes" aria-pressed="${wishes}">Мои поездки</button>
      </div>
      ${wishes ? `<section class="stack"><h2>Хочу сюда</h2>
        ${pet.wish.length ? pet.wish.map((id) => H.findCity(cities, id)).filter(Boolean).map((city) =>
          `<article class="info"><h2>${city.name}</h2><p>${city.when}</p>${unverified(city)}</article>`).join('')
        : '<p>Здесь появятся места, отмеченные на открытках кнопкой «Хочу сюда».</p>'}
      </section>` : `<div class="stack">
        <section class="info routes"><h2>Маршруты</h2>${passport.routes.map((route) => `
          <div><div class="route-label"><span>${route.name}</span><span>${route.done} / ${route.total}</span></div>
            <progress aria-label="${route.name}" value="${route.done}" max="${route.total}"></progress></div>`).join('')}</section>
        <section><h2>Штампы</h2><div class="stamps">${cities.map((city) => pet.visited.includes(city.id)
          ? `<button type="button" class="stamp open" data-action="stamp" data-value="${city.id}">${city.name}</button>`
          : `<span class="stamp" aria-label="${city.name}, закрыто">${city.name}</span>`).join('')}</div></section>
      </div>`}`;
  }

  function guestView() {
    const adopt = '<a class="button primary" href="index.html">Завести своего хвостика</a>';
    if (!guest) return `${heading('Ссылка не открывается')}${adopt}`;
    const city = H.findCity(cities, guest.cityId);
    const greeting = `К тебе в гости пришёл ${escapeHtml(guest.name)}!`;
    return `${heading(greeting, 'В гости')}${travelMedia(city, guest.species)}
      <section class="stack"><h2 class="guest-city">${city.name}</h2>${petLetter(city)}
        <section class="info"><p class="eyebrow">Знание из поездки</p><h2>Факт</h2><p>${city.fact}</p>${unverified(city)}</section>${adopt}
      </section>`;
  }

  const views = {
    choose: choiceView, home: homeView, map: mapView, trip: tripView,
    quiz: quizView, postcard: postcardView, passport: passportView, guest: guestView,
  };
  const navigation = { home: 'Дом', map: 'Города', passport: 'Паспорт' };

  function navButtons(items) {
    return Object.entries(items).map(([action, title]) => `<button type="button" data-action="${action}"
      ${current === action ? 'aria-current="page"' : ''}>${title}</button>`).join('');
  }

  function renderMenu() {
    menu.hidden = !menuOpen;
    menuButton.setAttribute('aria-expanded', String(menuOpen));
    if (!menuOpen) return;
    const destinations = pet ? { ...navigation } : { choose: 'Выбор питомца' };
    if (pet?.trip) destinations.trip = 'В пути';
    if (pet?.postcards.length) destinations['latest-postcard'] = 'Последняя открытка';
    menu.innerHTML = `${navButtons(destinations)}<hr>
      <label class="switch"><input type="checkbox" id="child-mode" ${child ? 'checked' : ''}>Детский режим</label>
      ${checkMode && pet?.trip ? '<button type="button" data-action="accelerate">Для проверки: ускорить возвращение</button>' : ''}
      ${pet ? '<button type="button" class="reset" data-action="reset">Сбросить питомца</button>' : ''}`;
  }

  function updateRoute() {
    clearTimeout(routeTimer);
    if (current !== 'trip' || !pet?.trip) return;
    const path = screen.querySelector('.route-progress');
    const marker = screen.querySelector('.route-marker');
    const percent = screen.querySelector('[data-route-percent]');
    if (!path || !marker) return;
    const length = path.getTotalLength();
    const progress = Math.max(0, Math.min(1,
      (Date.now() - pet.trip.startedAt) / (pet.trip.returnAt - pet.trip.startedAt)));
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length * (1 - progress));
    const point = path.getPointAtLength(length * progress);
    marker.setAttribute('transform', `translate(${point.x} ${point.y})`);
    if (percent) percent.textContent = `${Math.floor(progress * 100)}%`;
    if (progress < 1 && !document.hidden && !reducedMotion.matches) {
      routeTimer = setTimeout(updateRoute, pet.trip.kind === 'intro' ? 50 : 1000);
    }
  }

  function render(focusHeading = false, petTransition) {
    clearTimeout(routeTimer);
    renderedDay = localDay();
    screen.innerHTML = views[current]();
    const portrait = screen.querySelector('[data-pet-mode]');
    if (portrait && renderedScreen === current && !petTransition) portrait.dataset.petQuiet = '';
    petAnimation.mount(portrait, pet?.species);
    if (petTransition && portrait) petAnimation[petTransition](portrait);
    renderedScreen = current;
    nav.hidden = guestMode || !pet;
    menuButton.hidden = guestMode || !pet;
    nav.innerHTML = nav.hidden ? '' : navButtons(navigation);
    renderMenu();
    const video = screen.querySelector('video[data-autoplay]');
    if (video) {
      const showFallback = () => {
        if (!video.isConnected) return;
        const city = H.findCity(cities, video.dataset.city);
        const animal = video.dataset.species;
        const fallback = document.createElement('div');
        fallback.className = 'photo-postcard';
        fallback.innerHTML = `${cityPhoto(city, false, animal)}
          <p class="media-note">Видео не открылось. Показываем фото-иллюстрацию.</p>`;
        video.closest('figure').replaceWith(fallback);
      };
      video.addEventListener('error', showFallback, { once: true });
      video.querySelector('source').addEventListener('error', showFallback, { once: true });
      if (!reducedMotion.matches) {
        video.muted = true;
        const play = video.play();
        if (play) play.catch(() => {});
      }
    }
    if (current === 'trip') updateRoute();
    if (focusHeading) {
      screen.querySelector('h1').focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  function go(next, petTransition) {
    current = next;
    menuOpen = false;
    render(true, petTransition);
  }

  function showCard(card, quiz = false, petTransition) {
    cardId = card.id;
    go(quiz ? 'quiz' : 'postcard', petTransition);
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
    savePet(result.pet);
    showCard(result.postcard, false, 'enter');
    return true;
  }

  function refreshClock() {
    if (checkReturn()) return;
    if (current === 'trip') updateRoute();
    if (renderedDay !== localDay()) render();
  }

  function changeChoice(nextSpecies) {
    if (nextSpecies === selectedSpecies) return;
    if (!draftName.trim() || draftName === species[selectedSpecies][1]) draftName = species[nextSpecies][1];
    selectedSpecies = nextSpecies;
    render();
    screen.querySelector(`[data-action="species"][data-value="${nextSpecies}"]`).focus();
  }

  async function share() {
    const url = new URL('index.html', location.href);
    url.searchParams.set('guest', H.encodeGuest(pet, selectedCard().cityId));
    const box = document.querySelector('#share-box');
    const input = document.querySelector('#guest-url');
    const status = document.querySelector('#share-status');
    box.hidden = false;
    input.value = url.href;
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = 'Ссылка скопирована.';
    } catch {
      if (!input.isConnected) return;
      input.focus();
      input.select();
      status.textContent = 'Ссылка выделена. Скопируй её вручную.';
    }
  }

  const actions = {
    choose: () => go('choose'),
    home: () => { carePickerOpen = false; go('home'); },
    map: () => go('map'),
    trip: () => go('trip'),
    passport: () => go('passport'),
    collection: () => { passportTab = 'stamps'; go('passport'); },
    stamps: () => setPassportTab('stamps'),
    wishes: () => setPassportTab('wish'),
    species: (target) => changeChoice(target.dataset.value),
    color: (target) => {
      selectedColor = target.dataset.color;
      render();
      screen.querySelector(`[data-color="${selectedColor}"]`).focus();
    },
    care: (target) => {
      const result = H.chooseCare(pet, target.dataset.value, localDay());
      savePet(result.pet);
      carePickerOpen = false;
      go('home');
    },
    'care-options': () => { carePickerOpen = true; render(); },
    'care-intro': () => { carePickerOpen = false; go('home'); },
    'complete-care': (target) => {
      const result = H.doTask(pet, target.dataset.value, localDay());
      if (result.changed) savePet(result.pet);
      go('map');
    },
    start: (target) => {
      const id = target.dataset.value;
      if (!H.canStartTrip(pet, id, cities, localDay()).ok) return;
      savePet(H.startTrip(pet, id, cities, Date.now(), localDay()));
      go('trip', 'leave');
      checkReturn();
    },
    accelerate: () => {
      if (!checkMode || !pet.trip) return;
      const offset = H.TRIP_HOURS * 60 * 60 * 1000;
      const trip = { ...pet.trip, startedAt: pet.trip.startedAt - offset, returnAt: pet.trip.returnAt - offset };
      savePet({ ...pet, trip });
      checkReturn();
    },
    quiz: () => showCard(selectedCard(), true),
    answer: (target) => {
      const result = H.answerQuiz(pet, cardId, Number(target.dataset.value), cities);
      savePet(result.pet);
      render();
      screen.querySelector('[data-action="postcard"]').focus();
    },
    postcard: () => go('postcard'),
    'latest-postcard': () => showCard(pet.postcards[0], false),
    stamp: (target) => {
      const card = pet.postcards.find((item) => item.cityId === target.dataset.value);
      if (card) showCard(card);
    },
    wish: (target) => {
      const id = selectedCard().cityId;
      savePet(H.toggleWish(pet, id));
      target.setAttribute('aria-pressed', String(pet.wish.includes(id)));
    },
    share,
    reset: () => {
      if (!window.confirm('Сбросить питомца, дела, поездки и открытки?')) return;
      clearTimeout(returnTimer);
      savePet(null);
      selectedSpecies = 'cat';
      selectedColor = 'ginger';
      draftName = species.cat[1];
      cardId = null;
      passportTab = 'stamps';
      carePickerOpen = false;
      go('choose');
    },
  };

  function setPassportTab(tab) {
    passportTab = tab;
    render();
    screen.querySelector('.tabs button[aria-pressed="true"]').focus({ preventScroll: true });
  }

  menuButton.addEventListener('click', () => {
    menuOpen = !menuOpen;
    renderMenu();
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (menuOpen && !menu.contains(event.target) && !menuButton.contains(event.target)) {
      menuOpen = false;
      renderMenu();
    }
    if (target && !target.disabled) actions[target.dataset.action]?.(target);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuOpen) {
      menuOpen = false;
      renderMenu();
      menuButton.focus();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.id !== 'child-mode') return;
    child = event.target.checked;
    store(childKey, child ? '1' : '0');
    render();
    menu.querySelector('#child-mode').focus();
  });

  screen.addEventListener('input', (event) => {
    if (event.target.id !== 'pet-name') return;
    draftName = event.target.value;
    event.target.setCustomValidity('');
  });

  screen.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.target.elements['pet-name'];
    if (!input.value.trim()) {
      input.setCustomValidity('Введи имя питомца.');
      input.reportValidity();
      return;
    }
    const next = H.newPet({ name: input.value, species: selectedSpecies, color: selectedColor });
    savePet(next);
    go('map');
  });

  if (guestMode) {
    current = 'guest';
    render();
  } else {
    restore();
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshClock();
    });
    setInterval(refreshClock, 30000);
    if (!checkReturn()) {
      if (pet?.trip) current = 'trip';
      else if (pet && !pet.introDone) current = 'map';
      else if (pet) current = 'home';
      render();
    }
  }
})();
