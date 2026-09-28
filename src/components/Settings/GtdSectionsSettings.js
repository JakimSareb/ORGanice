// ORG Mode para Eli: Ajustes → Vista GTD y gestos. Deslizar (documentos y GTD) y, para cada
// sección de la vista GTD: mostrarla, ordenarla y decidir qué tareas entran.
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fromJS } from 'immutable';

import TabButtons from '../UI/TabButtons';
import { setEliSetting } from '../../actions/base';
import {
  sectionDef,
  sectionLabel,
  normalizeGtdSections,
  DEFAULT_SECTIONS,
  CUSTOM_ICONS,
  CUSTOM_PREFIX,
  isCustomId,
} from '../../lib/gtd/gtd_sections';

const selectSections = (s) => s.base.get('eliGtdSections');
const selectNoSwipeDocs = (s) => s.base.get('eliNoSwipeDocs') === true;
const selectNoSwipeGtd = (s) => s.base.get('eliNoSwipeGtd') === true;

const TICKS = [
  ['habits', 'Incluir hábitos (:STYLE: habit)'],
  ['future', 'Incluir tareas programadas para más adelante'],
  ['futurePriority', '… y las programadas para más adelante que tienen prioridad'],
  ['parked', 'Incluir tareas de proyectos dormidos o que aún no han empezado'],
];

const RulesInput = ({ label, value, placeholder, onSave, testId, hint }) => {
  const [text, setText] = useState(value.join(', '));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value.join(', '));
  }
  return (
    <label className="eli-gtdsec__rule">
      <span>{label}</span>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onSave(text)}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        data-testid={testId}
      />
      {/* (2.16) que se sepa que caben varios */}
      {hint && <small className="eli-gtdsec__rule-hint">{hint}</small>}
    </label>
  );
};

// (2.16) Nombre de la sección en el menú (se guarda al salir del campo)
const NameInput = ({ value, placeholder, onSave, testId }) => {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  return (
    <label className="eli-gtdsec__rule">
      <span>Nombre en el menú</span>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text.trim())}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        data-testid={testId}
      />
    </label>
  );
};

const Tick = ({ checked, label, onChange, testId }) => (
  <label className="eli-gtdsec__tick">
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onChange(e.target.checked)}
      data-testid={testId}
    />
    <span>{label}</span>
  </label>
);

export default function GtdSectionsSettings() {
  const dispatch = useDispatch();
  const stored = useSelector(selectSections);
  const noSwipeDocs = useSelector(selectNoSwipeDocs);
  const noSwipeGtd = useSelector(selectNoSwipeGtd);
  const cfg = normalizeGtdSections(stored);
  const [openId, setOpenId] = useState(null);

  const save = (next) => dispatch(setEliSetting('eliGtdSections', fromJS(next)));
  const setSection = (id, patch) =>
    save({ ...cfg, sections: { ...cfg.sections, [id]: { ...cfg.sections[id], ...patch } } });
  const move = (id, delta) => {
    const order = [...cfg.order];
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    order.splice(i, 1);
    order.splice(j, 0, id);
    save({ ...cfg, order });
  };
  const reset = () => {
    if (window.confirm('¿Volver a la configuración de secciones de siempre?')) save({});
  };
  // (2.16) Secciones propias
  const addCustom = () => {
    const id = `${CUSTOM_PREFIX}${Date.now().toString(36)}`;
    const custom = [...(cfg.custom || []), { id, label: 'Nueva sección', icon: CUSTOM_ICONS[0] }];
    save({ ...cfg, custom, order: [...cfg.order, id] });
    setOpenId(id);
  };
  const setCustom = (id, patch) =>
    save({ ...cfg, custom: (cfg.custom || []).map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const removeCustom = (id) => {
    const c = (cfg.custom || []).find((x) => x.id === id);
    if (!window.confirm(`¿Borrar la sección «${c ? c.label : ''}»? Las tareas no se tocan.`))
      return;
    const sections = { ...cfg.sections };
    delete sections[id];
    save({
      ...cfg,
      sections,
      custom: (cfg.custom || []).filter((x) => x.id !== id),
      order: cfg.order.filter((x) => x !== id),
    });
    setOpenId(null);
  };
  const HINT_STATES = 'Varios, separados por comas: NEXT, TODO';
  const HINT_TAGS = 'Varias, separadas por comas: @casa, @llamadas';
  const HINT_PROPS = 'Varias, separadas por comas: CONTEXTO, ENERGY=Low';

  const listSplit = (text) =>
    text
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  const renderOptions = (id) => {
    const def = sectionDef(id, cfg);
    const s = cfg.sections[id];
    const custom = isCustomId(id);
    const nameField =
      def.kind === 'agenda' || id === 'projects' ? null : custom ? (
        <>
          <NameInput
            value={def.label}
            placeholder="Nombre de la sección"
            onSave={(t) => setCustom(id, { label: t || 'Sección' })}
            testId={`eli-gtdsec-${id}-name`}
          />
          <div className="eli-gtdsec__icons" role="radiogroup" aria-label="Icono">
            {CUSTOM_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                className={'eli-gtdsec__icon' + (def.icon === icon ? ' is-on' : '')}
                onClick={() => setCustom(id, { icon })}
                aria-pressed={def.icon === icon}
                title="Icono"
              >
                <i className={icon} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <NameInput
          value={s.label || ''}
          placeholder={def.label}
          onSave={(t) => setSection(id, { label: t })}
          testId={`eli-gtdsec-${id}-name`}
        />
      );
    if (def.kind === 'agenda') {
      return <div className="eli-gtdsec__note">La agenda solo se puede mostrar u ocultar.</div>;
    }
    if (id === 'logbook') {
      return (
        <div className="eli-gtdsec__options">
          {nameField}
          <div className="eli-gtdsec__note">
            Las tareas terminadas (DONE, CANCELLED y demás estados de cierre).
          </div>
        </div>
      );
    }
    const isList = def.kind === 'list';
    return (
      <div className="eli-gtdsec__options">
        {nameField}
        {id === 'projects' ? (
          <>
            <Tick
              checked={s.allProjects !== false}
              label="Mostrar «Todos los proyectos»"
              onChange={(v) => setSection(id, { allProjects: v })}
              testId="eli-gtdsec-projects-all"
            />
            <div className="eli-gtdsec__note">Dentro de cada proyecto se ven sus acciones:</div>
          </>
        ) : (
          <>
            <div className="eli-gtdsec__note">
              {custom
                ? 'Sección propia: muestra las tareas abiertas que tengan alguno de estos estados, etiquetas o propiedades (si no pones ninguno, todas). Las tareas siguen también en su lista de siempre.'
                : isList
                ? 'Entran las tareas con cualquiera de estos (si cumplen varias listas, van a la primera en este orden):'
                : 'Además de su criterio propio, entran también las tareas con:'}
            </div>
            <RulesInput
              label="Estados"
              value={s.states}
              placeholder="p. ej. NEXT"
              hint={HINT_STATES}
              onSave={(t) => setSection(id, { states: listSplit(t).map((x) => x.toUpperCase()) })}
              testId={`eli-gtdsec-${id}-states`}
            />
            <RulesInput
              label="Etiquetas"
              value={s.tags}
              placeholder="p. ej. @casa"
              hint={HINT_TAGS}
              onSave={(t) => setSection(id, { tags: listSplit(t) })}
              testId={`eli-gtdsec-${id}-tags`}
            />
            <RulesInput
              label="Propiedades"
              value={s.props}
              placeholder="p. ej. CONTEXTO o CONTEXTO=casa"
              hint={HINT_PROPS}
              onSave={(t) => setSection(id, { props: listSplit(t) })}
              testId={`eli-gtdsec-${id}-props`}
            />
            {id === 'inbox' && (
              <Tick
                checked={s.inboxFile}
                label="Encabezados sin estado del fichero de entrada (inbox.org)"
                onChange={(v) => setSection(id, { inboxFile: v })}
                testId="eli-gtdsec-inbox-file"
              />
            )}
            {id === 'reference' && (
              <Tick
                checked={s.noStateLeaf}
                label="Encabezados sin estado ni tareas debajo"
                onChange={(v) => setSection(id, { noStateLeaf: v })}
                testId="eli-gtdsec-reference-leaf"
              />
            )}
            {id === 'focus' && (
              <>
                <Tick
                  checked={s.star !== false}
                  label="Tareas con ★ [#A]"
                  onChange={(v) => setSection(id, { star: v })}
                  testId="eli-gtdsec-focus-star"
                />
                <Tick
                  checked={s.due !== false}
                  label="Tareas con fecha (programada o límite) de hoy o ya pasada"
                  onChange={(v) => setSection(id, { due: v })}
                  testId="eli-gtdsec-focus-due"
                />
                <Tick
                  checked={s.autoStar !== false}
                  label="Poner ★ [#A] automáticamente cuando llega su fecha"
                  onChange={(v) => setSection(id, { autoStar: v })}
                  testId="eli-gtdsec-focus-autostar"
                />
              </>
            )}
          </>
        )}
        {TICKS.map(([key, label]) => (
          <Tick
            key={key}
            checked={s[key]}
            label={label}
            onChange={(v) => setSection(id, { [key]: v })}
            testId={`eli-gtdsec-${id}-${key}`}
          />
        ))}
        {custom ? (
          <button
            type="button"
            className="btn eli-gtdsec__reset-one"
            onClick={() => removeCustom(id)}
            data-testid={`eli-gtdsec-${id}-delete`}
          >
            Borrar esta sección
          </button>
        ) : (
          JSON.stringify(s) !== JSON.stringify(normalizeGtdSections(null).sections[id]) && (
            <button
              type="button"
              className="btn eli-gtdsec__reset-one"
              onClick={() => setSection(id, { ...DEFAULT_SECTIONS[id], show: s.show, label: '' })}
            >
              Restablecer esta sección
            </button>
          )
        )}
      </div>
    );
  };

  return (
    <>
      <div className="setting-container">
        <div className="setting-label">
          Deslizar en los documentos
          <div className="setting-label__description">
            A la derecha avanza el estado; a la izquierda borra (pide confirmación)
          </div>
        </div>
        <div data-testid="eli-swipe-docs">
          <TabButtons
            buttons={['Sí', 'No']}
            values={['yes', 'no']}
            selectedButton={noSwipeDocs ? 'no' : 'yes'}
            onSelect={(v) => dispatch(setEliSetting('eliNoSwipeDocs', v === 'no'))}
          />
        </div>
      </div>
      <div className="setting-container">
        <div className="setting-label">
          Deslizar en la vista GTD
          <div className="setting-label__description">
            A la derecha marca la tarea como hecha; a la izquierda la borra (pide confirmación)
          </div>
        </div>
        <div data-testid="eli-swipe-gtd">
          <TabButtons
            buttons={['Sí', 'No']}
            values={['yes', 'no']}
            selectedButton={noSwipeGtd ? 'no' : 'yes'}
            onSelect={(v) => dispatch(setEliSetting('eliNoSwipeGtd', v === 'no'))}
          />
        </div>
      </div>

      <div className="eli-gtdsec" data-testid="eli-gtd-sections">
        <div className="eli-gtdsec__head">
          <div className="setting-label">Secciones de la vista GTD</div>
          <button type="button" className="btn" onClick={reset} data-testid="eli-gtdsec-reset">
            Restablecer
          </button>
        </div>
        <div className="eli-gtdsec__hint">
          Ordénalas con las flechas (es el orden del menú y, si una tarea cumple varias listas, va a
          la primera), elige cuáles se ven y toca una para decidir qué tareas entran.
        </div>
        {cfg.order.map((id, i) => {
          const def = sectionDef(id, cfg);
          if (!def) return null;
          const s = cfg.sections[id];
          const open = openId === id;
          return (
            <div
              key={id}
              className={'eli-gtdsec__row' + (s.show === false ? ' is-hidden' : '')}
              data-testid={`eli-gtdsec-${id}`}
            >
              <div className="eli-gtdsec__line">
                <button
                  type="button"
                  className="eli-gtdsec__move"
                  onClick={() => move(id, -1)}
                  disabled={i === 0}
                  title="Subir"
                  data-testid={`eli-gtdsec-${id}-up`}
                >
                  <i className="fas fa-arrow-up" />
                </button>
                <button
                  type="button"
                  className="eli-gtdsec__move"
                  onClick={() => move(id, 1)}
                  disabled={i === cfg.order.length - 1}
                  title="Bajar"
                  data-testid={`eli-gtdsec-${id}-down`}
                >
                  <i className="fas fa-arrow-down" />
                </button>
                <input
                  type="checkbox"
                  checked={s.show !== false}
                  onChange={(e) => setSection(id, { show: e.target.checked })}
                  title="Mostrar esta sección"
                  aria-label={`Mostrar ${sectionLabel(id, cfg)}`}
                  data-testid={`eli-gtdsec-${id}-show`}
                />
                <button
                  type="button"
                  className="eli-gtdsec__name"
                  onClick={() => setOpenId(open ? null : id)}
                  aria-expanded={open}
                  data-testid={`eli-gtdsec-${id}-open`}
                >
                  <i className={def.icon} /> {sectionLabel(id, cfg)}
                  <i className={'fas ' + (open ? 'fa-caret-down' : 'fa-caret-right')} />
                </button>
              </div>
              {open && renderOptions(id)}
            </div>
          );
        })}
        <button
          type="button"
          className="btn eli-gtdsec__add"
          onClick={addCustom}
          data-testid="eli-gtdsec-add"
        >
          <i className="fas fa-plus" /> Nueva sección
        </button>
      </div>
    </>
  );
}
