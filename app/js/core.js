(function (root) {
  'use strict';

  const TRIP_HOURS = 8;
  const INTRO_TRIP_SECONDS = 6;
  const HOUR = 60 * 60 * 1000;

  const TASKS = [
    { id: 'walk', focus: 'movement', cat: 'Выйти на 10 минут', dog: 'Погулять со мной 10 минут' },
    { id: 'water', focus: 'water', cat: 'Выпить стакан воды', dog: 'Выпить стакан воды' },
    { id: 'breath', focus: 'calm', cat: 'Сделать три спокойных вдоха', dog: 'Сделать три спокойных вдоха' },
  ];

  const FOCUS = [
    { id: 'movement', label: 'Движение', taskId: 'walk' },
    { id: 'water', label: 'Вода', taskId: 'water' },
    { id: 'calm', label: 'Спокойствие', taskId: 'breath' },
  ];

  const SPECIES = ['cat', 'dog'];

  function newPet(opts) {
    const name = String((opts && opts.name) || '').trim().slice(0, 20);
    const species = SPECIES.includes(opts && opts.species) ? opts.species : 'cat';
    if (!name) throw new Error('Нужно имя питомца');
    return {
      name,
      species,
      color: (opts && opts.color) || 'ginger',
      introDone: false,
      care: null,
      trip: null,
      postcards: [],
      visited: [],
      wish: [],
    };
  }

  function normalizePet(pet) {
    return Object.assign({}, pet, {
      introDone: Boolean(pet.introDone || pet.postcards?.length || pet.visited?.length),
      care: pet.care && typeof pet.care === 'object' ? pet.care : null,
      trip: pet.trip || null,
      postcards: Array.isArray(pet.postcards) ? pet.postcards : [],
      visited: Array.isArray(pet.visited) ? pet.visited : [],
      wish: Array.isArray(pet.wish) ? pet.wish : [],
    });
  }

  function careForDay(pet, dayKey) {
    return pet.care?.dayKey === dayKey ? pet.care : null;
  }

  function chooseCare(pet, focusId, dayKey) {
    const focus = FOCUS.find((item) => item.id === focusId);
    if (!focus) throw new Error('Нет такого направления: ' + focusId);
    const current = careForDay(pet, dayKey);
    if (current?.done) return { pet, changed: false };
    if (current?.focus === focusId) return { pet, changed: false };
    return {
      pet: Object.assign({}, pet, {
        care: { dayKey, focus: focusId, taskId: focus.taskId, done: false, tripUsed: false },
      }),
      changed: true,
    };
  }

  function doTask(pet, taskId, dayKey) {
    const task = TASKS.find((item) => item.id === taskId);
    if (!task) throw new Error('Нет такого дела: ' + taskId);
    if (pet.trip) return { pet, changed: false };
    const current = careForDay(pet, dayKey);
    if (current?.done || (current && current.taskId !== taskId)) return { pet, changed: false };
    return {
      pet: Object.assign({}, pet, {
        care: {
          dayKey,
          focus: task.focus,
          taskId,
          done: true,
          tripUsed: false,
        },
      }),
      changed: true,
    };
  }

  function findCity(cities, cityId) {
    return cities.find((c) => c.id === cityId) || null;
  }

  function isIntro(pet) {
    return !pet.introDone && pet.postcards.length === 0 && pet.visited.length === 0;
  }

  function canStartTrip(pet, cityId, cities, dayKey) {
    if (pet.trip) return { ok: false, reason: 'Питомец уже в пути' };
    const city = findCity(cities, cityId);
    if (!city) return { ok: false, reason: 'Такого города нет' };
    if (isIntro(pet)) return { ok: true, reason: '', kind: 'intro' };
    const care = careForDay(pet, dayKey);
    if (!care?.done) return { ok: false, reason: 'Сначала сделай одно дело для себя' };
    if (care.tripUsed) return { ok: false, reason: 'Сегодняшняя поездка уже была' };
    return { ok: true, reason: '', kind: 'care' };
  }

  function startTrip(pet, cityId, cities, now, dayKey) {
    const check = canStartTrip(pet, cityId, cities, dayKey);
    if (!check.ok) throw new Error(check.reason);
    const intro = check.kind === 'intro';
    return Object.assign({}, pet, {
      care: intro ? pet.care : Object.assign({}, pet.care, { tripUsed: true }),
      trip: {
        cityId,
        startedAt: now,
        returnAt: now + (intro ? INTRO_TRIP_SECONDS * 1000 : TRIP_HOURS * HOUR),
        kind: check.kind,
      },
    });
  }

  function finishTrip(pet, cities, now, postcardId) {
    if (!pet.trip || now < pet.trip.returnAt) return { pet, postcard: null };
    const city = findCity(cities, pet.trip.cityId);
    const postcard = {
      id: postcardId,
      cityId: pet.trip.cityId,
      date: now,
      answered: false,
      correct: null,
    };
    const visited = pet.visited.includes(city.id) ? pet.visited : pet.visited.concat(city.id);
    return {
      pet: Object.assign({}, pet, {
        introDone: true,
        trip: null,
        visited,
        postcards: [postcard].concat(pet.postcards),
      }),
      postcard,
    };
  }

  function answerQuiz(pet, postcardId, optionIndex, cities) {
    const card = pet.postcards.find((p) => p.id === postcardId);
    if (!card) throw new Error('Открытки нет');
    if (card.answered) return { pet, correct: card.correct, already: true };
    const city = findCity(cities, card.cityId);
    const correct = optionIndex === city.quiz.correct;
    const postcards = pet.postcards.map((p) =>
      p.id === postcardId ? Object.assign({}, p, { answered: true, correct }) : p);
    return {
      pet: Object.assign({}, pet, { postcards }),
      correct,
      already: false,
    };
  }

  function toggleWish(pet, cityId) {
    const has = pet.wish.includes(cityId);
    return Object.assign({}, pet, {
      wish: has ? pet.wish.filter((id) => id !== cityId) : pet.wish.concat(cityId),
    });
  }

  function passport(pet, cities) {
    const routes = {};
    cities.forEach((c) => {
      (c.routes || []).forEach((r) => {
        routes[r] = routes[r] || { name: r, done: 0, total: 0 };
        routes[r].total += 1;
        if (pet.visited.includes(c.id)) routes[r].done += 1;
      });
    });
    return {
      visitedCount: pet.visited.length,
      total: cities.length,
      knowledgeCount: pet.postcards.filter((card) => card.answered && card.correct).length,
      routes: Object.values(routes),
    };
  }

  function encodeGuest(pet, cityId) {
    const json = JSON.stringify({ n: pet.name, s: pet.species, c: cityId });
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeGuest(token, cities) {
    try {
      const b64 = String(token).replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const data = JSON.parse(decodeURIComponent(escape(atob(b64 + pad))));
      if (typeof data.n !== 'string' || !data.n || data.n.length > 20) return null;
      if (!SPECIES.includes(data.s)) return null;
      if (!findCity(cities, data.c)) return null;
      return { name: data.n, species: data.s, cityId: data.c };
    } catch (e) {
      return null;
    }
  }

  const api = {
    TRIP_HOURS, INTRO_TRIP_SECONDS, TASKS, FOCUS, SPECIES,
    newPet, normalizePet, careForDay, chooseCare, doTask, canStartTrip, startTrip, finishTrip,
    answerQuiz, toggleWish, passport, encodeGuest, decodeGuest, findCity,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Hvostik = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
