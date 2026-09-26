import { Map, List, fromJS } from 'immutable';
import { parseOrg } from './parse_org';
import { exportOrg } from './export_org';
import rootOrgReducer from '../reducers/org';
import captureReducer from '../reducers/capture';

const stateFor = () =>
  Map({ path: '/i.org', files: Map({ '/i.org': parseOrg('* A\n* B\n') }), fileSettings: List() });
const out = (s) =>
  exportOrg({
    headers: s.getIn(['files', '/i.org', 'headers']),
    linesBeforeHeadings: List(),
    dontIndent: true,
  });
const template = (headerPaths) =>
  fromJS({ id: 't', description: 'Inbox', file: '', headerPaths, template: '' });

test('ruta de encabezado vacía o inexistente: se captura igualmente', () => {
  for (const paths of [[], [''], ['No existe']]) {
    const s = rootOrgReducer(stateFor(), {
      type: 'INSERT_CAPTURE',
      template: template(paths),
      content: '* Nueva',
      shouldPrepend: false,
      dirtying: true,
    });
    expect(out(s)).toBe('* A\n* B\n* Nueva\n');
  }
  const s = rootOrgReducer(stateFor(), {
    type: 'INSERT_CAPTURE',
    template: template(['A']),
    content: '* Nueva',
    shouldPrepend: false,
    dirtying: true,
  });
  expect(out(s)).toBe('* A\n** Nueva\n* B\n');
});

test('plantilla nueva sin ruta de encabezado', () => {
  const s = captureReducer(Map(), { type: 'ADD_NEW_EMPTY_CAPTURE_TEMPLATE' });
  expect(s.getIn(['captureTemplates', 0, 'headerPaths']).size).toBe(0);
});
