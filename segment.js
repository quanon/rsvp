// Japanese bunsetsu-like segmentation for RSVP.
// Classic script: exposes `RSVPSegment` on globalThis in browsers and via module.exports in Node.
(function (root) {
  'use strict';

  // Particles after which a following hiragana word starts a new bunsetsu.
  const PARTICLES = new Set([
    'は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'や', 'の', 'から', 'まで', 'より',
    'には', 'では', 'とは', 'へは', 'にも', 'でも', 'とも', 'からは', 'までは', 'ので', 'のに',
    'ば', 'て', 'って', 'ても', 'けど', 'けれど', 'けれども', 'ながら', 'たり',
    'など', 'なら', 'ほど', 'だけ', 'しか', 'ずつ', 'ごと', 'について', 'として', 'による', 'により',
  ]);

  // Hiragana tokens that continue the previous bunsetsu even after a particle.
  const CONTINUATIONS = new Set([
    'は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'ね', 'よ', 'か', 'な',
    'いる', 'います', 'いた', 'いました', 'おく', 'しまう', 'みる',
  ]);

  // Adnominals that bind to the following noun (この関数, その値).
  const ADNOMINALS = new Set(['この', 'その', 'あの', 'どの', 'こんな', 'そんな', 'あんな', 'どんな']);

  const CLOSERS = /^[、。，．,.!?！？:：;；)）」』】〕］\]}〉》…‥]+$/;
  const OPENERS = /^[(（「『【〔［\[{〈《]+$/;
  const SENTENCE_END = /[。．!?！？]$/;
  const COMMA_END = /[、，,:：;；]$/;
  const HIRAGANA = /^[ぁ-ゟー]+$/;
  const WHITESPACE = /^\s+$/;

  const MAX_CHUNK = 14;

  const segmenter =
    typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;

  function tokenize(text) {
    if (!segmenter) return text.split(/(\s+|[、。])/).filter(Boolean);
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }

  // BudouX (vendor/budoux-ja.js) is used when loaded; otherwise fall back to the heuristic splitter.
  const budoux = () => root.BudouX && root.BudouX.parser;
  const engine = () => (budoux() ? `BudouX ${root.BudouX.version}` : 'Intl.Segmenter');

  // Split one run of plain text (no URLs or inline code) into bunsetsu strings.
  function splitRun(text) {
    const parser = budoux();
    if (!parser) return splitRunHeuristic(text);
    // BudouX keeps spaces inside chunks, so split on whitespace first.
    return text.split(/\s+/).filter(Boolean).flatMap((part) => parser.parse(part));
  }

  function splitRunHeuristic(text) {
    const chunks = [];
    let cur = '';
    let last = ''; // last token appended to cur
    let pendingOpen = false;

    const flush = () => {
      if (cur) chunks.push(cur);
      cur = '';
      last = '';
    };

    for (const tok of tokenize(text)) {
      if (WHITESPACE.test(tok)) {
        if (!pendingOpen) flush();
        continue;
      }
      if (CLOSERS.test(tok)) {
        // Attach punctuation to the previous chunk, or to the last emitted one.
        if (cur) cur += tok;
        else if (chunks.length) chunks[chunks.length - 1] += tok;
        else cur = tok;
        flush();
        pendingOpen = false;
        continue;
      }
      if (OPENERS.test(tok)) {
        if (!pendingOpen) flush();
        cur += tok;
        last = tok;
        pendingOpen = true;
        continue;
      }

      const isHira = HIRAGANA.test(tok);
      const lastIsHira = HIRAGANA.test(last);
      let startNew = false;
      if (cur && !pendingOpen) {
        if (isHira) {
          // A hiragana word right after a particle is usually a new content word.
          startNew = PARTICLES.has(last) && !CONTINUATIONS.has(tok);
        } else {
          // Kanji/katakana/latin after function words starts a new bunsetsu;
          // after other content tokens it is part of a compound and stays.
          startNew = lastIsHira && !ADNOMINALS.has(last);
        }
        if (!startNew && cur.length + tok.length > MAX_CHUNK) startNew = true;
      }
      if (startNew) flush();
      cur += tok;
      last = tok;
      pendingOpen = false;
    }
    flush();
    return chunks;
  }

  // Atoms that must never be split by the word segmenter.
  const ATOM = /(`[^`\n]+`|https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'*+,;=%]+|[A-Za-z0-9_]+(?:[.\-/:@#][A-Za-z0-9_]+)+)/g;

  function splitLine(line) {
    const out = [];
    let pos = 0;
    for (const m of line.matchAll(ATOM)) {
      if (m.index > pos) out.push(...splitRun(line.slice(pos, m.index)));
      // Trailing sentence punctuation is not part of a URL.
      const atom = m[0].startsWith('`') ? m[0] : m[0].replace(/[.,;:!?']+$/, '');
      out.push(atom.replace(/^`|`$/g, ''));
      pos = m.index + atom.length;
    }
    if (pos < line.length) out.push(...splitRun(line.slice(pos)));

    // A lone particle (e.g. after "(Promise) を" or an atom) belongs to the preceding chunk.
    const merged = [];
    for (const c of out) {
      const prev = merged[merged.length - 1];
      const lone = c.match(/^([\u3041-\u309F]+)([、。，．,.!?！？]*)$/);
      const isParticle = lone && (PARTICLES.has(lone[1]) || CONTINUATIONS.has(lone[1]));
      if (prev && CLOSERS.test(c)) {
        merged[merged.length - 1] = prev + c;
      } else if (prev && isParticle && !SENTENCE_END.test(prev) && !COMMA_END.test(prev) && !OPENERS.test(prev)) {
        merged[merged.length - 1] = prev + c;
      } else {
        merged.push(c);
      }
    }
    // BudouX sometimes splits off one hiragana of a short word (は / じめに, まと / め); rejoin it.
    for (let i = merged.length - 1; i >= 0 && merged.length > 1; i--) {
      if (!/^[\u3041-\u309F]$/.test(merged[i])) continue;
      if (i > 0 && !SENTENCE_END.test(merged[i - 1]) && !COMMA_END.test(merged[i - 1])) {
        merged.splice(i - 1, 2, merged[i - 1] + merged[i]);
      } else if (i < merged.length - 1) {
        merged.splice(i, 2, merged[i] + merged[i + 1]);
      }
    }
    return merged;
  }

  // Strip inline Markdown decorations and table pipes while keeping text; inline code is left intact.
  function stripInline(line) {
    return line
      .split(/(`[^`\n]+`)/)
      .map((part, i) =>
        i % 2
          ? part
          : part
              .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
              .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
              .replace(/(\*\*|__)(.+?)\1/g, '$2')
              .replace(/(^|[^*])\*(?!\s)([^*]+)\*/g, '$1$2')
              .replace(/<(https?:\/\/[^>]+)>/g, ' $1 ')
              .replace(/<[^>]+>/g, '')
              .replace(/\|/g, ' ')
      )
      .join('');
  }

  /**
   * Convert text (plain or Markdown) into display chunks.
   * @returns {{text: string, pause: number, heading: boolean, sentenceStart: boolean}[]}
   */
  function segment(text, { skipCode = true } = {}) {
    const chunks = [];
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let inFence = false;
    let paragraphStart = true;

    const endParagraph = () => {
      if (chunks.length) chunks[chunks.length - 1].pause = Math.max(chunks[chunks.length - 1].pause, 3);
      paragraphStart = true;
    };

    for (const raw of lines) {
      if (/^\s*(```|~~~)/.test(raw)) {
        if (!inFence && skipCode) {
          endParagraph();
          chunks.push({ text: '〔コード省略〕', pause: 2, heading: false, sentenceStart: true, code: true });
        }
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        if (!skipCode && raw.trim()) {
          chunks.push({ text: raw.trim(), pause: 2, heading: false, sentenceStart: true, code: true });
        }
        continue;
      }
      const isRule = /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(raw);
      const isTableSeparator = /^[\s|:-]+$/.test(raw) && raw.includes('|') && raw.includes('-');
      if (!raw.trim() || isRule || isTableSeparator) {
        endParagraph();
        continue;
      }

      let line = raw;
      let heading = false;
      const h = line.match(/^\s*#{1,6}\s+(.*)$/);
      if (h) {
        line = h[1];
        heading = true;
        endParagraph();
      }
      // List markers and blockquotes.
      line = line.replace(/^\s*(>\s*)+/, '').replace(/^\s*([-*+]|\d+[.)])\s+/, '');
      line = stripInline(line).trim();
      if (!line) continue;

      const parts = splitLine(line);
      parts.forEach((t, i) => {
        const prev = chunks[chunks.length - 1];
        const sentenceStart = paragraphStart || i === 0 || !prev || SENTENCE_END.test(prev.text);
        let pause = 1;
        if (SENTENCE_END.test(t)) pause = 2;
        else if (COMMA_END.test(t)) pause = 1.5;
        chunks.push({ text: t, pause, heading, sentenceStart });
        paragraphStart = false;
      });
      // A line break inside a paragraph still deserves a short pause; headings and list items a longer one.
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.pause = Math.max(lastChunk.pause, heading ? 3 : 1.5);
      if (heading) paragraphStart = true;
    }
    return chunks;
  }

  const api = { segment, splitLine, splitRun, engine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RSVPSegment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
