'use strict';
// index.html 에서 <script id="tally-core"> 블록만 꺼내 격리된 vm 에서 실행한다.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'index.html');

function readHtml() {
  return fs.readFileSync(htmlPath, 'utf8');
}

function loadCore() {
  const html = readHtml();
  const m = html.match(/<script id="tally-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html 에 <script id="tally-core"> 블록이 없다');
  const sandbox = {}; // window·document 없음: 로직이 DOM 에 기대면 여기서 실패한다
  vm.createContext(sandbox);
  vm.runInContext(m[1] + '\n;this.SurveyTally = SurveyTally;', sandbox);
  return sandbox.SurveyTally;
}

module.exports = { loadCore, readHtml };
