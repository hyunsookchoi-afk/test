'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./load-core');

const T = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v)); // vm 경계 넘은 객체 비교용

const summary = (text) =>
  plain(T.tally(text).questions.map((q) => [q.name, q.valid, q.average, q.blank, q.excluded]));

test('칸 판정: 1~5 는 유효, 앞뒤 공백 무시', () => {
  for (const v of ['1', '2', '3', '4', '5', ' 3', '4 ', ' 5　', ' 1 ']) {
    assert.equal(T.classifyCell(v).kind, 'valid', JSON.stringify(v));
  }
  assert.equal(T.classifyCell(' 4 ').value, 4);
});

test('칸 판정: 비었거나 공백만 있으면 빈 응답', () => {
  for (const v of ['', ' ', '   ', ' ', '　', undefined]) {
    assert.equal(T.classifyCell(v).kind, 'blank', JSON.stringify(v));
  }
});

test('칸 판정: 그 밖은 제외', () => {
  for (const v of ['0', '6', '3.0', '3.5', '+3', '03', '１', '1 2', '모름', 'N/A', '-', '1,2']) {
    assert.equal(T.classifyCell(v).kind, 'excluded', JSON.stringify(v));
  }
});

test('평균 형식: 둘째 자리까지, 셋째 자리에서 반올림', () => {
  assert.equal(T.formatAverage(0, 0), '-');
  assert.equal(T.formatAverage(9, 3), '3.00');
  assert.equal(T.formatAverage(10, 3), '3.33'); // 3.333…
  assert.equal(T.formatAverage(11, 3), '3.67'); // 3.666…
  assert.equal(T.formatAverage(7, 2), '3.50');
  assert.equal(T.formatAverage(5, 1), '5.00');
  assert.equal(T.formatAverage(1, 1), '1.00');
  // 셋째 자리가 정확히 5 인 경우는 올림 (부동소수점 오차에 흔들리지 않아야 함)
  assert.equal(T.formatAverage(2675, 1000), '2.68'); // (2.675).toFixed(2) 는 "2.67"
  assert.equal(T.formatAverage(1005, 1000), '1.01');
  assert.equal(T.formatAverage(4125, 1000), '4.13');
  assert.equal(T.formatAverage(37, 8), '4.63');      // 4.625
  assert.equal(T.formatAverage(9, 8), '1.13');       // 1.125
  assert.equal(T.formatAverage(39, 8), '4.88');      // 4.875
  assert.equal(T.formatAverage(41, 40), '1.03');     // 1.025
  assert.equal(T.formatAverage(4, 3), '1.33');       // 1.3333
  assert.equal(T.formatAverage(2004, 1000), '2.00'); // 2.004
});

test('평균 형식: 큰 수에서도 정확', () => {
  // 유효 응답 100만 개, 모두 5
  assert.equal(T.formatAverage(5_000_000, 1_000_000), '5.00');
  assert.equal(T.formatAverage(2_999_995, 1_000_000), '3.00'); // 2.999995
});

test('기본 집계: 첫 열은 집계하지 않는다', () => {
  const text = [
    '응답번호\t문항1\t문항2',
    '1\t5\t3',
    '2\t4\t',
    '3\t3\t모름',
  ].join('\r\n') + '\r\n';
  const r = T.tally(text);
  assert.equal(r.error, null);
  assert.equal(r.responseRows, 3);
  assert.deepEqual(summary(text), [
    ['문항1', 3, '4.00', 0, 0],
    ['문항2', 1, '3.00', 1, 1],
  ]);
});

test('응답번호 열 값이 1~5 여도 문항으로 세지 않는다', () => {
  const text = '번호\tQ\n1\t2\n2\t2\n3\t2\n';
  assert.deepEqual(summary(text), [['Q', 3, '2.00', 0, 0]]);
});

test('유효 응답이 0 이면 평균은 "-"', () => {
  const text = '번호\tQ1\tQ2\n1\t\t9\n2\t \tx\n';
  assert.deepEqual(summary(text), [
    ['Q1', 0, '-', 2, 0],
    ['Q2', 0, '-', 0, 2],
  ]);
});

test('칸 수가 모자란 줄은 모자란 칸을 빈 응답으로 센다', () => {
  const text = '번호\tQ1\tQ2\tQ3\n1\t5\n2\t4\t4\n3\n';
  const r = T.tally(text);
  assert.equal(r.shortRows, 3); // 머리글 4칸, 세 줄 모두 모자람
  assert.deepEqual(summary(text), [
    ['Q1', 2, '4.50', 1, 0],
    ['Q2', 1, '4.00', 2, 0],
    ['Q3', 0, '-', 3, 0],
  ]);
});

test('칸 수가 많은 줄: 넘치는 칸은 집계하지 않고 줄 수를 알린다', () => {
  const text = '번호\tQ1\n1\t5\t1\t1\n2\t3\n';
  const r = T.tally(text);
  assert.equal(r.longRows, 1);
  assert.deepEqual(summary(text), [['Q1', 2, '4.00', 0, 0]]);
});

test('줄바꿈 \\n, \\r\\n, \\r 모두 받는다', () => {
  const rows = ['번호\tQ', '1\t1', '2\t2'];
  for (const eol of ['\n', '\r\n', '\r']) {
    assert.deepEqual(summary(rows.join(eol) + eol), [['Q', 2, '1.50', 0, 0]], JSON.stringify(eol));
    assert.deepEqual(summary(rows.join(eol)), [['Q', 2, '1.50', 0, 0]], JSON.stringify(eol));
  }
});

test('끝의 빈 줄은 버린다', () => {
  const text = '번호\tQ\n1\t3\n\n\n';
  const r = T.tally(text);
  assert.equal(r.responseRows, 1);
  assert.deepEqual(summary(text), [['Q', 1, '3.00', 0, 0]]);
});

test('모든 칸이 빈 줄(탭만 있는 줄)은 응답 줄로 보고 빈 응답으로 센다', () => {
  const text = '번호\tQ1\tQ2\n1\t1\t2\n\t\t\n';
  assert.deepEqual(summary(text), [
    ['Q1', 1, '1.00', 1, 0],
    ['Q2', 1, '2.00', 1, 0],
  ]);
});

test('엑셀이 따옴표로 감싼 칸(칸 안 줄바꿈)을 푼다', () => {
  const text = '번호\t"만족도\n(1~5)"\t"다시 ""이용"""\n1\t4\t5\n2\t"2"\t" 3 "\n';
  assert.deepEqual(summary(text), [
    ['만족도\n(1~5)', 2, '3.00', 0, 0],
    ['다시 "이용"', 2, '4.00', 0, 0],
  ]);
});

test('따옴표 처리: 칸 중간의 따옴표는 글자 그대로', () => {
  assert.deepEqual(plain(T.parseTSV('a"b\tc\n')), [['a"b', 'c']]);
  assert.deepEqual(plain(T.parseTSV('"a\tb"\tc')), [['a\tb', 'c']]);
});

test('머리글만 있으면 모두 0 과 "-"', () => {
  const r = T.tally('번호\tQ1\tQ2\r\n');
  assert.equal(r.responseRows, 0);
  assert.deepEqual(summary('번호\tQ1\tQ2\r\n'), [
    ['Q1', 0, '-', 0, 0],
    ['Q2', 0, '-', 0, 0],
  ]);
});

test('빈 입력과 문항 없는 입력은 오류로 알린다', () => {
  assert.equal(T.tally('').error, 'empty');
  assert.equal(T.tally('\n\n').error, 'empty');
  assert.equal(T.tally('번호\n1\n2').error, 'no-questions');
});

test('빈 머리글은 열 번호로 이름 붙인다', () => {
  const r = T.tally('번호\t\tQ3\n1\t1\t1\n');
  assert.equal(r.questions[0].name, '(2번째 열)');
  assert.equal(r.questions[1].name, 'Q3');
});

test('같은 이름의 문항도 열마다 따로 센다', () => {
  assert.deepEqual(summary('번호\tQ\tQ\n1\t1\t5\n'), [
    ['Q', 1, '1.00', 0, 0],
    ['Q', 1, '5.00', 0, 0],
  ]);
});

test('유효·빈·제외의 합은 언제나 응답 줄 수', () => {
  const text = '번호\tA\tB\tC\n1\t1\tx\n2\t\t5\t6\t7\n3\n4\t 2 \t\t3\n';
  const r = T.tally(text);
  for (const q of r.questions) {
    assert.equal(q.valid + q.blank + q.excluded, r.responseRows, q.name);
  }
});

test('종합 예시', () => {
  const text = [
    '응답번호\t서비스 만족도\t추천 의향\t재이용 의향',
    '1\t5\t4\t3',
    '2\t4\t \t3',
    '3\t3\t5\t0',
    '4\t  2 \t모름',
    '5\t5\t4\t',
    '6\t\t1\t5',
  ].join('\r\n') + '\r\n';
  assert.deepEqual(summary(text), [
    ['서비스 만족도', 5, '3.80', 1, 0], // (5+4+3+2+5)/5
    ['추천 의향', 4, '3.50', 1, 1],     // (4+5+4+1)/4
    ['재이용 의향', 3, '3.67', 2, 1],   // (3+3+5)/3, 4번 줄은 모자란 칸 → 빈 응답
  ]);
});
