(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    editor: $('editor'), reader: $('reader'), input: $('input'), file: $('file'), skipCode: $('skipCode'),
    stats: $('stats'), start: $('start'), word: $('word'), prev: $('prev'), next: $('next'), badge: $('badge'),
    progress: $('progress'), position: $('position'), remaining: $('remaining'), toggle: $('toggle'),
    back: $('back'), forward: $('forward'), speed: $('speed'), speedLabel: $('speedLabel'), edit: $('edit'),
    themeToggle: $('themeToggle'),
  };

  const STORE = { text: 'rsvp.text', speed: 'rsvp.speed', theme: 'rsvp.theme', pos: 'rsvp.pos' };

  let chunks = [];
  let index = 0;
  let timer = null;

  // Chunks per minute for an average-length chunk.
  const speed = () => Number(els.speed.value);

  // Longer chunks stay on screen longer; punctuation and paragraph ends add a pause.
  function delayFor(chunk) {
    const base = 60000 / speed();
    const lenFactor = Math.min(Math.max(0.6 + chunk.text.length * 0.08, 0.7), 1.8);
    return base * lenFactor * chunk.pause;
  }

  function formatTime(ms) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function remainingMs(from) {
    let ms = 0;
    for (let i = from; i < chunks.length; i++) ms += delayFor(chunks[i]);
    return ms;
  }

  // Shrink long chunks so they fit the center cell (about 10 full-width characters at 3.75rem).
  function fontSizeFor(text) {
    const width = [...text].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x2000 ? 0.55 : 1), 0);
    const rem = Math.min(3.75, Math.max(1.25, 36 / Math.max(width, 1)));
    return `min(${rem}rem, ${(90 / Math.max(width, 1)).toFixed(1)}vw)`;
  }

  function render() {
    const c = chunks[index];
    els.word.textContent = c ? c.text : '';
    els.word.style.fontSize = fontSizeFor(c ? c.text : '');
    els.prev.textContent = chunks[index - 1]?.text ?? '';
    els.next.textContent = chunks[index + 1]?.text ?? '';
    els.badge.classList.toggle('hidden', !(c && c.heading));
    els.progress.value = index;
    els.position.textContent = `${Math.min(index + 1, chunks.length)} / ${chunks.length}`;
    els.remaining.textContent = `残り ${formatTime(remainingMs(index))}`;
    localStorage.setItem(STORE.pos, String(index));
  }

  function updateSpeedLabel() {
    els.speedLabel.textContent = `${speed()} 文節/分`;
    localStorage.setItem(STORE.speed, String(speed()));
  }

  function updateStats() {
    const n = segment().length;
    const total = segment().reduce((ms, c) => ms + delayFor(c), 0);
    els.stats.textContent = n ? `${n} 文節 / 約 ${formatTime(total)} (${RSVPSegment.engine()})` : '';
  }

  let cache = { key: '', chunks: [] };
  function segment() {
    const key = `${els.skipCode.checked}\u0000${els.input.value}`;
    if (cache.key !== key) {
      cache = { key, chunks: RSVPSegment.segment(els.input.value, { skipCode: els.skipCode.checked }) };
    }
    return cache.chunks;
  }

  const playing = () => timer !== null;

  function tick() {
    render();
    if (index >= chunks.length - 1) {
      pause();
      return;
    }
    timer = setTimeout(() => {
      index++;
      tick();
    }, delayFor(chunks[index]));
  }

  function play({ restart = true } = {}) {
    if (playing() || !chunks.length) return;
    if (restart && index >= chunks.length - 1) index = 0;
    els.toggle.textContent = '⏸ 一時停止';
    timer = 0; // mark as playing before the first timeout is set
    tick();
  }

  function pause() {
    clearTimeout(timer);
    timer = null;
    els.toggle.textContent = '▶ 再生';
  }

  function seek(i) {
    const wasPlaying = playing();
    pause();
    index = Math.min(Math.max(i, 0), Math.max(chunks.length - 1, 0));
    render();
    if (wasPlaying) play({ restart: false });
  }

  function sentenceStartBefore(i) {
    // If already at a sentence start, go to the previous one.
    let j = chunks[i]?.sentenceStart ? i - 1 : i;
    while (j > 0 && !chunks[j].sentenceStart) j--;
    return Math.max(j, 0);
  }

  function sentenceStartAfter(i) {
    let j = i + 1;
    while (j < chunks.length && !chunks[j].sentenceStart) j++;
    return j;
  }

  function openReader() {
    chunks = segment();
    if (!chunks.length) {
      els.input.focus();
      return;
    }
    localStorage.setItem(STORE.text, els.input.value);
    const saved = Number(localStorage.getItem(STORE.pos));
    index = saved > 0 && saved < chunks.length && els.input.value === lastOpenedText ? saved : 0;
    lastOpenedText = els.input.value;
    els.progress.max = String(chunks.length - 1);
    els.editor.classList.add('hidden');
    els.reader.classList.remove('hidden');
    render();
  }

  function openEditor() {
    pause();
    els.reader.classList.add('hidden');
    els.editor.classList.remove('hidden');
    updateStats();
    els.input.focus();
  }

  function setTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    els.themeToggle.checked = dark;
    localStorage.setItem(STORE.theme, dark ? 'dark' : 'light');
  }

  // Restore previous session.
  els.input.value = localStorage.getItem(STORE.text) ?? '';
  let lastOpenedText = els.input.value;
  els.speed.value = localStorage.getItem(STORE.speed) ?? els.speed.value;
  setTheme((localStorage.getItem(STORE.theme) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark');
  updateSpeedLabel();
  updateStats();

  els.input.addEventListener('input', updateStats);
  els.skipCode.addEventListener('change', updateStats);
  els.file.addEventListener('change', () => {
    const f = els.file.files[0];
    if (!f) return;
    f.text().then((t) => {
      els.input.value = t;
      updateStats();
    });
  });
  els.start.addEventListener('click', openReader);
  els.edit.addEventListener('click', openEditor);
  els.toggle.addEventListener('click', () => (playing() ? pause() : play()));
  els.back.addEventListener('click', () => seek(sentenceStartBefore(index)));
  els.forward.addEventListener('click', () => seek(sentenceStartAfter(index)));
  els.progress.addEventListener('input', () => seek(Number(els.progress.value)));
  els.speed.addEventListener('input', () => {
    updateSpeedLabel();
    if (chunks.length) render();
  });
  els.themeToggle.addEventListener('change', () => setTheme(els.themeToggle.checked));

  document.addEventListener('keydown', (e) => {
    const inReader = !els.reader.classList.contains('hidden');
    if (!inReader) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || document.activeElement !== els.input)) {
        e.preventDefault();
        openReader();
      }
      return;
    }
    const step = (d) => {
      els.speed.value = String(speed() + d);
      updateSpeedLabel();
      render();
    };
    const handled = [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'];
    if (!handled.includes(e.key)) return;
    // Avoid a focused button also receiving the key (e.g. Space toggling twice).
    if (e.target instanceof HTMLElement && e.target.matches('button, input')) e.target.blur();
    switch (e.key) {
      case ' ': playing() ? pause() : play(); break;
      case 'ArrowLeft': seek(sentenceStartBefore(index)); break;
      case 'ArrowRight': seek(sentenceStartAfter(index)); break;
      case 'ArrowUp': step(20); break;
      case 'ArrowDown': step(-20); break;
      case 'Escape': openEditor(); break;
    }
    e.preventDefault();
  });
})();
