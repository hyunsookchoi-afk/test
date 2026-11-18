'use strict';
// 페이지 검사: 외부 자원·분석 도구·저장 API·네트워크 API 를 쓰지 않는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readHtml } = require('./load-core');

const html = readHtml();

test('외부 주소를 참조하지 않는다', () => {
  assert.doesNotMatch(html, /\b(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(html, /<(?:link|iframe|img|object|embed|audio|video|source)\b/i);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /@import|@font-face|url\(/i);
});

test('데이터를 보내거나 저장하는 API 를 쓰지 않는다', () => {
  const banned = [
    'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'RTCPeerConnection',
    'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.', 'serviceWorker',
    'postMessage', 'window.open', 'new Image', 'Worker(',
    'eval(', 'new Function', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write',
  ];
  for (const word of banned) assert.ok(!html.includes(word), `금지어: ${word}`);
  assert.doesNotMatch(html, /<form\b/i);
});

test('CSP 로 외부 요청을 막는다', () => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'CSP meta 가 없다');
  const csp = m[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.doesNotMatch(csp, /https?:|\*/);
});

test('결과 표 머리글이 정해진 순서다', () => {
  const heads = [...html.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['문항', '유효 응답', '평균', '빈 응답', '제외']);
});

test('계산 로직 블록은 DOM 을 쓰지 않는다', () => {
  const core = html.match(/<script id="tally-core">([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(core, /\b(document|window|navigator|location)\b/);
});

test('저장소 맨 위에 빈 .nojekyll 이 있다', () => {
  const p = path.join(__dirname, '..', '.nojekyll');
  assert.ok(fs.existsSync(p));
  assert.equal(fs.statSync(p).size, 0);
});
