'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('../app/js/core.js');
const { isSwipe } = require('../app/js/pet-anim.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cities.json'), 'utf8'));
const cities = data.cities;
const HOUR = 60 * 60 * 1000;
const D1 = '2026-12-01', D2 = '2026-12-02';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ок   ' + name); }
  catch (e) { console.log('  ОШИБКА ' + name + '\n        ' + e.message); process.exitCode = 1; }
}

console.log('Ядро Хвостика');

test('питомец создаётся с первой бесплатной поездкой, без имени — ошибка', () => {
  const p = H.newPet({ name: 'Пряник', species: 'cat' });
  assert.equal(p.name, 'Пряник'); assert.equal(p.species, 'cat');
  assert.equal(p.introDone, false); assert.equal(p.care, null); assert.equal(p.energy, undefined);
  assert.throws(() => H.newPet({ name: '   ' }));
});

test('неизвестный вид заменяется на кота', () => {
  assert.equal(H.newPet({ name: 'Х', species: 'дракон' }).species, 'cat');
});

test('человек выбирает направление заботы и получает одно дело', () => {
  const p = H.newPet({ name: 'Бублик', species: 'dog' });
  const r = H.chooseCare(p, 'movement', D1);
  assert.equal(r.changed, true);
  assert.deepEqual(r.pet.care, { dayKey: D1, focus: 'movement', taskId: 'walk', done: false, tripUsed: false });
});

test('выбранное дело отмечается один раз и не даёт абстрактных баллов', () => {
  let p = H.chooseCare(H.newPet({ name: 'Пряник' }), 'water', D1).pet;
  let r = H.doTask(p, 'water', D1); p = r.pet;
  assert.equal(r.changed, true); assert.equal(p.care.done, true); assert.equal(p.energy, undefined);
  r = H.doTask(p, 'water', D1);
  assert.equal(r.changed, false);
});

test('чаепитие в Туле можно выбрать вместо дыхания и отметить один раз', () => {
  const initial = H.newPet({ name: 'Пряник' });
  const breath = H.chooseCare(initial, 'calm', D1).pet;
  const tea = H.chooseCare(breath, 'calm', D1, 'tea');
  assert.equal(tea.changed, true);
  assert.equal(tea.pet.care.taskId, 'tea');
  assert.equal(H.chooseCare(tea.pet, 'calm', D1, 'tea').changed, false);
  assert.equal(H.doTask(tea.pet, 'breath', D1).changed, false);
  const result = H.doTask(tea.pet, 'tea', D1);
  assert.equal(result.changed, true);
  assert.equal(H.doTask(result.pet, 'tea', D1).changed, false);
  assert.throws(() => H.chooseCare(initial, 'water', D1, 'tea'));
});

test('второе дело в тот же день не открывает ещё одну поездку', () => {
  let p = H.doTask(H.newPet({ name: 'Пряник' }), 'water', D1).pet;
  const r = H.doTask(p, 'breath', D1);
  assert.equal(r.changed, false); assert.equal(r.pet.care.taskId, 'water');
});

test('на следующий день можно выбрать новое дело', () => {
  let p = H.doTask(H.newPet({ name: 'Пряник' }), 'water', D1).pet;
  p = H.chooseCare(p, 'calm', D2).pet;
  p = H.doTask(p, 'breath', D2).pet;
  assert.equal(p.care.dayKey, D2); assert.equal(p.care.taskId, 'breath'); assert.equal(p.care.done, true);
});

test('неизвестные направление и дело — ошибка', () => {
  const p = H.newPet({ name: 'Х' });
  assert.throws(() => H.chooseCare(p, 'дневник', D1));
  assert.throws(() => H.doTask(p, 'дневник', D1));
});

test('первая поездка бесплатна и длится ровно 60 секунд', () => {
  const now = 1000 * HOUR;
  const p = H.startTrip(H.newPet({ name: 'Пряник' }), 'tula', cities, now, D1);
  assert.equal(p.trip.kind, 'intro');
  assert.equal(p.trip.fromCityId, 'moscow');
  assert.equal(p.trip.returnAt, now + 60_000);
  assert.equal(p.care, null);
});

test('после знакомства или пропуска оно не повторяется при загрузке', () => {
  const p = H.newPet({ name: 'Бублик', species: 'dog' });
  assert.equal(H.normalizePet(p).introSeen, false);
  const seen = H.seeIntro(p);
  assert.equal(p.introSeen, false);
  assert.equal(H.seeIntro(seen), seen);
  assert.equal(H.normalizePet(JSON.parse(JSON.stringify(seen))).introSeen, true);
  assert.equal(seen.introDone, false);
});

test('поездка начинается только с явно выбранным открытым городом', () => {
  const p = { ...H.seeIntro(H.newPet({ name: 'Пряник' })), nextStopId: 'tula' };
  assert.throws(() => H.startTrip(p, undefined, cities, 0, D1), /Выбери город/);
  assert.throws(() => H.startTrip(p, 'unknown', cities, 0, D1), /Такого города нет/);
  assert.throws(() => H.startTrip(p, 'kazan', cities, 0, D1), /ещё готовим/);
  assert.equal(H.startTrip(p, 'yaroslavl', cities, 0, D1).trip.cityId, 'yaroslavl');
  assert.equal(p.trip, null);
});

test('из дома нельзя поехать в Москву, со стоянки — в тот же город', () => {
  const p = H.newPet({ name: 'Пряник' });
  assert.throws(() => H.startTrip(p, 'moscow', cities, 0, D1), /уже здесь/);
  const arrived = H.finishTrip(H.startTrip(p, 'tula', cities, 0, D1), cities, 60_000, 'a').pet;
  const ready = H.doTask(arrived, 'tea', D1).pet;
  assert.throws(() => H.startTrip(ready, 'tula', cities, 60_000, D1), /уже здесь/);
  assert.equal(ready.care.tripUsed, false);
  assert.equal(H.startTrip(ready, 'yaroslavl', cities, 60_000, D1).trip.fromCityId, 'tula');
});

test('после первой поездки нужна забота о себе', () => {
  let p = H.startTrip(H.newPet({ name: 'Пряник' }), 'tula', cities, 0, D1);
  p = H.finishTrip(p, cities, H.INTRO_TRIP_SECONDS * 1000, 'intro').pet;
  assert.equal(p.introDone, true);
  assert.equal(H.canStartTrip(p, 'yaroslavl', cities, D1).ok, false);
  assert.throws(() => H.startTrip(p, 'yaroslavl', cities, 0, D1), /Сначала сделай/);
});

test('во время поездки вторая не начинается', () => {
  const p = H.startTrip(H.newPet({ name: 'Пряник' }), 'tula', cities, 0, D1);
  assert.equal(H.canStartTrip(p, 'yaroslavl', cities, D1).ok, false);
});

test('одно выполненное дело открывает ровно одну поездку на 8 часов', () => {
  let p = H.newPet({ name: 'Пряник' }); p.introDone = true;
  p = H.doTask(p, 'walk', D1).pet;
  assert.equal(p.trip, null);
  p = H.startTrip(p, 'yaroslavl', cities, 0, D1);
  assert.equal(p.trip.kind, 'care'); assert.equal(p.trip.returnAt, H.TRIP_HOURS * HOUR);
  assert.equal(p.care.tripUsed, true);
  p = H.finishTrip(p, cities, H.TRIP_HOURS * HOUR, 'c1').pet;
  assert.equal(H.canStartTrip(p, 'tula', cities, D1).ok, false);
});

test('до возврата открытки нет, после — есть и город открыт', () => {
  let p = H.startTrip(H.newPet({ name: 'Пряник' }), 'tula', cities, 0, D1);
  let r = H.finishTrip(p, cities, H.INTRO_TRIP_SECONDS * 1000 - 1, 'c1');
  assert.equal(r.postcard, null); assert.ok(r.pet.trip);
  r = H.finishTrip(p, cities, H.INTRO_TRIP_SECONDS * 1000, 'c1');
  assert.ok(r.postcard); assert.equal(r.pet.trip, null);
  assert.deepEqual(r.pet.visited, ['tula']);
});

test('повторная поездка в тот же город не дублирует штамп', () => {
  let p = H.newPet({ name: 'Пряник' });
  p.introDone = true; p.visited = ['tula'];
  p = H.doTask(p, 'water', D1).pet;
  p = H.startTrip(p, 'tula', cities, 0, D1);
  p = H.finishTrip(p, cities, H.TRIP_HOURS * HOUR, 'c2').pet;
  assert.deepEqual(p.visited, ['tula']);
});

test('угадайка сохраняет знание, но не даёт сил и баллов', () => {
  const p = H.newPet({ name: 'Пряник' });
  p.postcards = [{ id: 'a', cityId: 'tula', answered: false, correct: null }];
  const r = H.answerQuiz(p, 'a', 2, cities);
  assert.equal(r.correct, true); assert.equal(r.pet.energy, undefined);
  assert.equal(r.pet.postcards[0].answered, true);
});

test('ответ на угадайку принимается один раз', () => {
  const p = H.newPet({ name: 'Пряник' });
  p.postcards = [{ id: 'a', cityId: 'tula', answered: true, correct: false }];
  assert.equal(H.answerQuiz(p, 'a', 2, cities).already, true);
});

test('паспорт считает города, маршруты и верные ответы', () => {
  const p = H.newPet({ name: 'Пряник' });
  p.visited = ['yaroslavl', 'suzdal'];
  p.postcards = [{ id: 'a', cityId: 'yaroslavl', answered: true, correct: true }];
  const ps = H.passport(p, cities);
  assert.equal(ps.visitedCount, 2); assert.equal(ps.knowledgeCount, 1);
  assert.equal(ps.routes.find((r) => r.name === 'Золотое кольцо').done, 2);
});

test('старый питомец сохраняется и переводится на новые правила', () => {
  const old = H.newPet({ name: 'Пряник' });
  delete old.introDone; delete old.introSeen; old.energy = 5; old.doneTasks = ['water'];
  old.postcards = [{ id: 'old', cityId: 'tula' }]; old.visited = ['tula'];
  const p = H.normalizePet(old);
  assert.equal(p.introDone, true); assert.equal(p.care, null); assert.equal(p.name, 'Пряник');
  assert.equal(p.introSeen, true);
  assert.deepEqual(p.visited, ['tula']);
});

test('старый Бублик в Туле сохраняет дело и может выбрать Ярославль', () => {
  const care = { dayKey: D1, taskId: 'tea', focus: 'calm', done: true, tripUsed: false };
  const old = {
    name: 'Бублик', species: 'dog', care, trip: null, visited: ['tula'], wish: [],
    postcards: [{ id: 'tula-old', cityId: 'tula', answered: true, correct: true }],
    arrival: { cardId: 'tula-old', answered: true },
  };
  const p = H.normalizePet(old);
  assert.equal(p.introSeen, true);
  assert.equal(p.introDone, true);
  assert.equal(H.currentCityId(p), 'tula');
  assert.deepEqual(H.careForDay(p, D1), care);
  assert.deepEqual(p.arrival, old.arrival);
  assert.equal(H.startTrip(p, 'yaroslavl', cities, 0, D1).trip.kind, 'care');
});

test('«Хочу сюда» включается и выключается', () => {
  let p = H.newPet({ name: 'Пряник' });
  p = H.toggleWish(p, 'baikal'); assert.deepEqual(p.wish, ['baikal']);
  p = H.toggleWish(p, 'baikal'); assert.deepEqual(p.wish, []);
});

test('ссылка «В гости» кодирует имя, вид и город и читается обратно', () => {
  const p = H.newPet({ name: 'Бублик', species: 'dog' });
  const back = H.decodeGuest(H.encodeGuest(p, 'baikal'), cities);
  assert.deepEqual(back, { name: 'Бублик', species: 'dog', cityId: 'baikal' });
});

test('имя с эмодзи и кириллицей читается без ошибок', () => {
  const p = H.newPet({ name: 'Пряник 🐱' });
  assert.equal(H.decodeGuest(H.encodeGuest(p, 'tula'), cities).name, 'Пряник 🐱');
});

test('испорченная или чужая ссылка даёт null', () => {
  assert.equal(H.decodeGuest('не-ссылка!!', cities), null);
  const bad = Buffer.from(JSON.stringify({ n: 'Х', s: 'cat', c: 'atlantis' })).toString('base64');
  assert.equal(H.decodeGuest(bad, cities), null);
});

test('в ссылке нет личных данных: только имя, вид и город', () => {
  const p = H.newPet({ name: 'Пряник' });
  p.wish = ['baikal']; p.visited = ['tula'];
  const json = Buffer.from(H.encodeGuest(p, 'tula').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.deepEqual(Object.keys(JSON.parse(json)).sort(), ['c', 'n', 's']);
});

console.log('\nДанные городов');

test('в первой партии 12 городов', () => {
  assert.equal(cities.length, 12);
});

test('у каждого города есть все поля и три факта', () => {
  for (const c of cities) {
    assert.ok(c.name && c.id, 'нет имени/id у ' + c.id);
    assert.equal(c.known.length, 3, 'нужно 3 пункта «Чем знаменит»: ' + c.id);
    assert.ok(c.fact && c.when && c.tagline, 'пустое поле: ' + c.id);
    assert.ok(c.food || c.проверено, 'нет еды у непроверенного города: ' + c.id);
    assert.ok(c.source, 'нет источника: ' + c.id);
    assert.ok(Number.isFinite(c.coordinates?.lat) && Number.isFinite(c.coordinates?.lon), 'нет координат: ' + c.id);
    assert.ok(c.coordinates_source, 'нет источника координат: ' + c.id);
  }
});

test('у каждой угадайки 3 варианта и верный ответ внутри', () => {
  for (const c of cities) {
    assert.equal(c.quiz.options.length, 3, c.id);
    assert.ok(c.quiz.correct >= 0 && c.quiz.correct < 3, c.id);
  }
});

test('id городов уникальны', () => {
  const ids = cities.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('пометка «проверено» стоит честно: у проверенных есть источники и нет несверенного', () => {
  for (const c of cities.filter((city) => city.проверено)) {
    assert.ok(c.источники?.length >= 2, 'мало источников: ' + c.id);
    assert.equal(c.не_сверено?.length ?? 0, 0, 'есть несверенное: ' + c.id);
  }
  assert.ok(!cities.find((c) => c.id === 'tula').routes.includes('Золотое кольцо'), 'Тула не входит в Золотое кольцо');
});

console.log('\nЖесты');

test('выбор питомца принимает свайп в обе стороны', () => {
  assert.equal(isSwipe('side', -75, 14), true);
  assert.equal(isSwipe('side', 75, -14), true);
  assert.equal(isSwipe('side', 34, 0), false);
  assert.equal(isSwipe('side', -48, 42), false);
});

test('дело и дневник принимают свайп вверх', () => {
  assert.equal(isSwipe('up', 13, -68), true);
  assert.equal(isSwipe('up', 0, -44), true);
  assert.equal(isSwipe('up', 0, -43), false);
  assert.equal(isSwipe('up', 6, 75), false);
  assert.equal(isSwipe('up', 66, -45), false);
});

test('шторка принимает свайп вниз', () => {
  assert.equal(isSwipe('down', -14, 77), true);
  assert.equal(isSwipe('down', 0, 26), false);
  assert.equal(isSwipe('down', 0, -75), false);
  assert.equal(isSwipe('down', 56, 49), false);
});

console.log('\nИтог: пройдено ' + passed + ' проверок' + (process.exitCode ? ', есть ошибки' : ', ошибок нет'));
