// Голос питомца (27.11.2026): встроенный синтез речи телефона (Web Speech API), без сервера и сети.
// У кота голос выше и мягче, у собаки ниже и бодрее. Браузер разрешает речь только после первого касания экрана.
(function (root) {
  'use strict';

  const synth = root.speechSynthesis;
  const supported = Boolean(synth && root.SpeechSynthesisUtterance);
  const key = 'hvostik.v1.voice';
  const tone = {
    cat: { pitch: 1.35, rate: 1.0 },
    dog: { pitch: 0.8, rate: 1.06 },
  };
  let enabled = true;
  let voice = null;
  let unlocked = false;

  try { enabled = root.localStorage.getItem(key) !== '0'; } catch { /* приватный режим: голос по умолчанию включён */ }

  function pickVoice() {
    if (!supported) return;
    const ru = synth.getVoices().filter((item) => item.lang?.toLowerCase().startsWith('ru'));
    // Предпочитаем «живые» голоса, если телефон их предлагает.
    voice = ru.find((item) => /natural|neural|premium|enhanced|milena|yuri|google/i.test(item.name)) ?? ru[0] ?? null;
  }
  if (supported) {
    pickVoice();
    synth.addEventListener?.('voiceschanged', pickVoice);
  }

  // Chrome и Safari не дают говорить, пока человек не коснулся страницы.
  const unlock = () => { unlocked = true; };
  root.addEventListener('pointerdown', unlock, { once: true, capture: true });
  root.addEventListener('keydown', unlock, { once: true, capture: true });

  function stop() {
    if (supported) synth.cancel();
  }

  function say(text, species = 'cat', options = {}) {
    if (!supported || !enabled || !unlocked || !text) return false;
    stop();
    const utterance = new root.SpeechSynthesisUtterance(String(text).replace(/[«»]/g, ''));
    const base = tone[species] ?? tone.cat;
    utterance.lang = 'ru-RU';
    if (voice) utterance.voice = voice;
    utterance.pitch = base.pitch;
    utterance.rate = base.rate * (options.child ? 0.93 : 1);
    utterance.volume = 1;
    synth.speak(utterance);
    return true;
  }

  // Сколько ждать до следующей фразы, чтобы питомец успел договорить.
  function duration(text) {
    if (!supported || !enabled || !unlocked || !text) return 0;
    const words = String(text).split(/\s+/).length;
    return Math.round(words * 420 + 1200);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    try { root.localStorage.setItem(key, enabled ? '1' : '0'); } catch { /* не сохраняется — не страшно */ }
    if (!enabled) stop();
  }

  root.HVVoice = {
    supported,
    get enabled() { return enabled; },
    setEnabled, say, stop, duration,
  };
})(window);
