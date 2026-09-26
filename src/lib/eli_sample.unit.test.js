/* eslint-env node */
import { expandSampleDates } from '../actions/base';
import { parseOrg } from './parse_org';
const fs = require('fs');
const path = require('path');
const sampleContent = fs.readFileSync(path.join(process.cwd(), 'sample.org'), 'utf8');

test('fechas relativas del manual', () => {
  const today = new Date(2026, 8, 26);
  expect(expandSampleDates('<%HOY%> <%HOY+3%> [%HOY-1 10:00%] <%HOY% .+1d>', today)).toBe(
    '<2026-09-26 Sat> <2026-09-29 Tue> [2026-09-25 Fri 10:00] <2026-09-26 Sat .+1d>'
  );
});

test('el manual se lee bien', () => {
  const text = expandSampleDates(sampleContent, new Date(2026, 8, 26));
  expect(text).not.toMatch(/%HOY/);
  const file = parseOrg(text);
  expect(file.get('headers').size).toBeGreaterThan(50);
  const kws = file.getIn(['todoKeywordSets', 0, 'keywords']).toArray();
  expect(kws).toEqual(['NEXT', 'TODO', 'MAYBE', 'WAITING', 'PROJECT', 'DONE', 'CANCELLED']);
});
