// ORG Mode para Eli (3.10): «:Created: [fecha]» en las notas pasa a la propiedad :CREATED:
import { parseDescriptionPrefixElements, parseOrg } from './parse_org';
import { exportOrg } from './export_org';

const props = (r) => r.propertyListItems.toJS().map((p) => p.property);

describe('3.10 :Created: → :CREATED:', () => {
  test('sin cajón', () => {
    const r = parseDescriptionPrefixElements(':Created: [2026-10-18 Sun 20:54]\nnotas');
    expect(props(r)).toEqual(['CREATED']);
    expect(r.strippedDescription).toBe('notas');
  });
  test('tras el cajón', () => {
    const r = parseDescriptionPrefixElements(
      ':PROPERTIES:\n:AREA: Casa\n:END:\n:Created: [2026-10-18 Sun 20:54]\nnotas'
    );
    expect(props(r)).toEqual(['AREA', 'CREATED']);
    expect(r.strippedDescription).toBe('notas');
  });
  test('antes del cajón (Emacs)', () => {
    const r = parseDescriptionPrefixElements(
      ':Created: [2026-10-18 Sun 20:54]\n:PROPERTIES:\n:ID: x\n:END:\nnotas'
    );
    expect(props(r)).toEqual(['ID', 'CREATED']);
    expect(r.strippedDescription).toBe('notas');
  });
  test('no duplica si ya existe', () => {
    const r = parseDescriptionPrefixElements(
      ':PROPERTIES:\n:CREATED: [2026-10-17 Sat 10:00]\n:END:\n:Created: [2026-10-18 Sun 20:54]\n'
    );
    expect(props(r)).toEqual(['CREATED']);
  });
  test('una línea :Created: más abajo en las notas no se toca', () => {
    const r = parseDescriptionPrefixElements('hola\n:Created: [2026-10-18 Sun 20:54]');
    expect(props(r)).toEqual([]);
  });
  test('al guardar queda dentro del cajón', () => {
    const file = parseOrg('* TODO Tarea\n:Created: [2026-10-18 Sun 20:54]\nnotas\n');
    const out = exportOrg({
      headers: file.get('headers'),
      linesBeforeHeadings: file.get('linesBeforeHeadings'),
      dontIndent: true,
    });
    expect(out).toContain(':PROPERTIES:\n:CREATED: [2026-10-18 Sun 20:54]\n:END:\nnotas');
    expect(out).not.toContain(':Created:');
  });
});
