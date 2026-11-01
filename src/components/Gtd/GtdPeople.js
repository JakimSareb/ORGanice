// ORG Mode para Eli (4.48/4.50): Personas y Agendas en la vista GTD (páginas del menú lateral) y el
// árbol de una agenda (puntos = subcabeceras de agendas.org), que también sale en la ficha de la
// persona.
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import {
  bodyLines,
  visibleChildren,
  filterWords,
  nodeMatches,
  nodeMatchesDeep,
  contactMatches,
} from '../../lib/gtd/gtd_agendas';
import {
  agendaAddPoint,
  agendaToggle,
  agendaToggleDone,
  agendaEditNode,
  agendaDeleteNode,
  createContact,
  openPersonCard,
} from '../../lib/gtd/gtd_persons_actions';
import {
  agendaToMeeting,
  openHeadingInDocs,
  deleteHeading,
  renameHeading,
  createProjectAgenda,
} from '../../lib/gtd/gtd_agendas_actions';
import { reunionesPathFor, agendasPathFor } from '../../lib/gtd/gtd_persons_actions';
import { meetingsIn, filterMeetings } from '../../lib/gtd/gtd_meetings';
import { loadFileQuietly } from '../../actions/org';
import { askText } from '../../lib/eli_prompt';
import { openNewMeeting } from './GtdNewMeeting';
import { OrgText } from '../EliHeadingViews/OrgRender';

// Notas de una cabecera tal cual: ítems (con su casilla marcable, las de siempre) y párrafos
const BodyLines = ({ headerId, body }) => {
  const dispatch = useDispatch();
  const lines = bodyLines(body);
  if (!lines.some((l) => l.line.trim())) return null;
  return (
    <ul className="gtd-people__items">
      {lines.map(({ i, line, item }) => {
        if (!item) {
          if (!line.trim()) return null;
          return (
            <li key={i} className="gtd-people__para">
              <OrgText text={line.trim()} />
            </li>
          );
        }
        const depth = Math.min(4, Math.floor(item.indent.replace(/\t/g, '  ').length / 2));
        return (
          <li
            key={i}
            className={
              'gtd-people__item' + (item.check === 'X' || item.check === 'x' ? ' is-done' : '')
            }
            style={depth ? { paddingLeft: `${depth * 14}px` } : undefined}
            data-testid="gtd-agenda-item"
          >
            {item.check !== null ? (
              <button
                type="button"
                className="gtd-people__check"
                aria-pressed={item.check !== ' '}
                onClick={() => dispatch(agendaToggle(headerId, i))}
                data-testid="gtd-agenda-check"
              >
                <i className={item.check === ' ' ? 'far fa-square' : 'far fa-check-square'} />
              </button>
            ) : (
              <span className="gtd-people__bullet">{item.bullet === '+' ? '+' : '•'}</span>
            )}
            <span className="gtd-people__text">
              <OrgText text={item.text} />
            </span>
          </li>
        );
      })}
    </ul>
  );
};

// (4.57) Editar una cabecera de la agenda: título (solo los puntos), notas y borrar (solo los puntos)
const NodeEditor = ({ node, isRoot, onSave, onCancel, onDelete }) => {
  const [title, setTitle] = useState(node.rawTitle || node.title);
  const [notes, setNotes] = useState(node.body);
  const ok = isRoot || !!title.trim();
  return (
    <div className="gtd-agedit" data-testid="gtd-agenda-edit">
      {!isRoot && (
        <input
          type="text"
          className="gtd-tickler__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ok) {
              e.preventDefault();
              onSave({ title, notes });
            }
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Punto a tratar"
          aria-label="Título del punto"
          data-testid="gtd-agenda-edit-title"
        />
      )}
      <textarea
        className="gtd-tickler__input gtd-agedit__notes"
        value={notes}
        rows={Math.min(12, Math.max(4, notes.split('\n').length + 1))}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder="Notas"
        aria-label="Notas"
        data-testid="gtd-agenda-edit-notes"
      />
      <div className="gtd-tickler__add">
        <button
          type="button"
          className="gtd-review__btn is-primary"
          disabled={!ok}
          onClick={() => onSave(isRoot ? { notes } : { title, notes })}
          data-testid="gtd-agenda-edit-save"
        >
          Guardar
        </button>
        <button
          type="button"
          className="gtd-review__btn"
          onClick={onCancel}
          data-testid="gtd-agenda-edit-cancel"
        >
          Cancelar
        </button>
        {!isRoot && (
          <button
            type="button"
            className="gtd-review__btn is-danger"
            onClick={onDelete}
            data-testid="gtd-agenda-edit-delete"
          >
            <i className="fas fa-trash" /> Borrar
          </button>
        )}
      </div>
    </div>
  );
};

// Un punto a tratar (subcabecera) con sus subpuntos y su detalle
const PointNode = ({
  node,
  hideDone,
  collapsed,
  toggleCollapsed,
  selecting,
  sel,
  toggleSel,
  ctl,
  words,
}) => {
  const kids = visibleChildren(node, hideDone).filter((c) => nodeMatchesDeep(c, words));
  const hasMore = kids.length > 0 || !!node.body.trim();
  // con un filtro escrito se ve todo lo que coincide
  const isOpen = words.length > 0 || !collapsed.has(node.headerId);
  const editing = ctl.editingId === node.headerId;
  return (
    <li className="gtd-agpoint" data-testid="gtd-agenda-point">
      <div className={'gtd-agpoint__row' + (node.done ? ' is-done' : '')}>
        {/* (4.60) triángulo de plegar a la IZQUIERDA y «hecho» a la DERECHA (mano derecha) */}
        <button
          type="button"
          className="gtd-agpoint__fold"
          onClick={() => hasMore && toggleCollapsed(node.headerId)}
          aria-expanded={hasMore ? isOpen : undefined}
          aria-label={hasMore ? (isOpen ? 'Plegar' : 'Desplegar') : undefined}
          tabIndex={hasMore ? 0 : -1}
          data-testid="gtd-agenda-point-fold"
        >
          {hasMore && <i className={isOpen ? 'fas fa-caret-down' : 'fas fa-caret-right'} />}
        </button>
        <button
          type="button"
          className="gtd-agpoint__title"
          onClick={() => hasMore && toggleCollapsed(node.headerId)}
          aria-expanded={hasMore ? isOpen : undefined}
          data-testid="gtd-agenda-point-title"
        >
          <OrgText text={node.title} />
        </button>
        {node.points > 0 && (
          <span className="gtd-side__count" data-testid="gtd-agenda-point-count">
            {node.points}
          </span>
        )}
        {!selecting && (
          <>
            <button
              type="button"
              className="gtd-people__mini"
              title="Editar el punto y sus notas"
              onClick={() => ctl.setEditing(editing ? null : node.headerId)}
              data-testid="gtd-agenda-point-edit"
            >
              <i className="fas fa-pen" />
            </button>
            <button
              type="button"
              className="gtd-people__mini"
              title="Añadir subpunto"
              onClick={() => ctl.addChild(node)}
              data-testid="gtd-agenda-point-add"
            >
              <i className="fas fa-plus" />
            </button>
            <button
              type="button"
              className="gtd-people__mini"
              title="Llevar a reunión…"
              onClick={() => ctl.toMeeting([node.headerId])}
              data-testid="gtd-agenda-point-meeting"
            >
              <i className="fas fa-share-square" />
            </button>
            {ctl.openDoc && (
              <button
                type="button"
                className="gtd-people__mini"
                title="Abrir en Documentos"
                onClick={() => ctl.openDoc(node)}
                data-testid="gtd-agenda-point-open"
              >
                <i className="fas fa-external-link-alt" />
              </button>
            )}
          </>
        )}
        {selecting ? (
          <input
            type="checkbox"
            className="gtd-agpoint__sel"
            checked={sel.has(node.headerId)}
            onChange={() => toggleSel(node.headerId)}
            aria-label="Seleccionar el punto"
            data-testid="gtd-agenda-point-select"
          />
        ) : (
          <button
            type="button"
            className="gtd-people__check gtd-agpoint__done"
            aria-pressed={node.done}
            title={node.done ? 'Volver a abrir el punto' : 'Marcar como tratado'}
            onClick={() => ctl.done(node)}
            data-testid="gtd-agenda-point-done"
          >
            <i className={node.done ? 'far fa-check-circle' : 'far fa-circle'} />
          </button>
        )}
      </div>
      {editing && (
        <NodeEditor
          key={node.headerId}
          node={node}
          isRoot={false}
          onSave={(v) => ctl.save(node, v)}
          onCancel={() => ctl.setEditing(null)}
          onDelete={() => ctl.remove(node)}
        />
      )}
      {isOpen && hasMore && (
        <div className="gtd-agpoint__more">
          {!editing && <BodyLines headerId={node.headerId} body={node.body} />}
          {kids.length > 0 && (
            <ul className="gtd-agpoint__list">
              {kids.map((c) => (
                <PointNode
                  key={c.headerId}
                  node={c}
                  hideDone={hideDone}
                  collapsed={collapsed}
                  toggleCollapsed={toggleCollapsed}
                  selecting={selecting}
                  sel={sel}
                  toggleSel={toggleSel}
                  ctl={ctl}
                  words={words}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};

// Una agenda (cabecera principal): sus notas, el árbol de puntos y «Añadir punto»
export const AgendaBody = ({
  agenda,
  onOpenDoc = null,
  testId = 'gtd-agenda-body',
  filter = '',
}) => {
  const dispatch = useDispatch();
  const words = filterWords(filter);
  const [editingId, setEditingId] = useState(null);
  const [text, setText] = useState('');
  const [hideDone, setHideDone] = useState(true);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const add = async () => {
    const t = text.trim();
    if (!t) return;
    if (await dispatch(agendaAddPoint({ headerId: agenda.headerId }, t))) setText('');
  };
  const toggleCollapsed = (id) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleSel = (id) =>
    setSel((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const endSelect = () => {
    setSelecting(false);
    setSel(new Set());
  };
  const ctl = {
    editingId,
    setEditing: setEditingId,
    save: (node, vals) => {
      dispatch(agendaEditNode(node.headerId, vals));
      setEditingId(null);
    },
    remove: async (node) => {
      if (await dispatch(agendaDeleteNode(node.headerId, node.title, node.points)))
        setEditingId(null);
    },
    openDoc: onOpenDoc,
    done: (node) => dispatch(agendaToggleDone(node.headerId)),
    addChild: async (node) => {
      const t = await askText({
        title: `Subpunto de «${node.title}»`,
        placeholder: 'Punto a tratar',
        okLabel: 'Añadir',
      });
      if (t && t.trim()) dispatch(agendaAddPoint({ headerId: node.headerId }, t));
    },
    toMeeting: async (ids) => {
      if ((await dispatch(agendaToMeeting(ids))) > 0) endSelect();
    },
  };
  const kids = visibleChildren(agenda, hideDone).filter((c) => nodeMatchesDeep(c, words));
  const editingRoot = editingId === agenda.headerId;
  const nDone = (function count(n) {
    return n.children.reduce((x, c) => x + (c.done ? 1 : 0) + count(c), 0);
  })(agenda);
  return (
    <div className="gtd-people__agenda" data-testid={testId}>
      {editingRoot ? (
        <NodeEditor
          key={agenda.headerId}
          node={agenda}
          isRoot
          onSave={(v) => ctl.save(agenda, v)}
          onCancel={() => setEditingId(null)}
          onDelete={() => {}}
        />
      ) : (
        <BodyLines headerId={agenda.headerId} body={agenda.body} />
      )}
      {kids.length > 0 && (
        <ul className="gtd-agpoint__list" data-testid="gtd-agenda-points">
          {kids.map((c) => (
            <PointNode
              key={c.headerId}
              node={c}
              hideDone={hideDone}
              collapsed={collapsed}
              toggleCollapsed={toggleCollapsed}
              selecting={selecting}
              sel={sel}
              toggleSel={toggleSel}
              ctl={ctl}
              words={words}
            />
          ))}
        </ul>
      )}
      {!kids.length && !agenda.body.trim() && (
        <p className="gtd-people__hint">Sin puntos todavía.</p>
      )}
      <div className="gtd-tickler__add">
        {!editingRoot && (
          <button
            type="button"
            className="gtd-review__btn"
            onClick={() => setEditingId(agenda.headerId)}
            data-testid="gtd-agenda-edit-root"
          >
            <i className="fas fa-pen" /> {agenda.body.trim() ? 'Editar notas' : 'Añadir notas'}
          </button>
        )}
        {nDone > 0 && (
          <label className="gtd-people__hint">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              data-testid="gtd-agenda-hide-done"
            />{' '}
            Ocultar tratados ({nDone})
          </label>
        )}
        {agenda.points > 0 &&
          (selecting ? (
            <>
              <button
                type="button"
                className="gtd-review__btn is-primary"
                disabled={!sel.size}
                onClick={() => ctl.toMeeting(Array.from(sel))}
                data-testid="gtd-agenda-select-meeting"
              >
                <i className="fas fa-share-square" /> Llevar a reunión ({sel.size})
              </button>
              <button type="button" className="gtd-review__btn" onClick={endSelect}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="gtd-review__btn"
              onClick={() => setSelecting(true)}
              data-testid="gtd-agenda-select"
            >
              <i className="far fa-check-square" /> Seleccionar
            </button>
          ))}
      </div>
      <form
        className="gtd-tickler__add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          className="gtd-tickler__input gtd-tickler__new"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Añadir punto…"
          data-testid="gtd-agenda-new"
        />
        <button
          type="submit"
          className="gtd-review__btn is-primary"
          disabled={!text.trim()}
          data-testid="gtd-agenda-add"
        >
          <i className="fas fa-plus" /> Añadir
        </button>
        {onOpenDoc && (
          <button
            type="button"
            className="gtd-review__btn"
            onClick={() => onOpenDoc(agenda)}
            data-testid="gtd-agenda-open-doc"
          >
            <i className="fas fa-external-link-alt" /> Abrir en Documentos
          </button>
        )}
      </form>
    </div>
  );
};

// (4.60) Persona, lugar o proyecto de la cabecera principal de una agenda
const agendaKind = (a) => (a.person ? 'person' : a.project ? 'project' : 'place');
export const agendaLabel = (a) => (a.person ? a.person.name : a.project ? a.project.name : a.title);

// (4.60) Datos para «Nueva reunión» desde una agenda
const meetingDetailOf = (agenda, project = null) => ({
  persons: agenda.person ? [{ id: agenda.person.id, title: agenda.person.name }] : [],
  project:
    project ||
    (agenda.project && !agenda.project.missing
      ? { orgId: agenda.project.id, title: agenda.project.name }
      : null),
  agendaId: agenda.headerId,
  agendaName: agendaLabel(agenda),
});

const AgendaRow = ({ agenda, label, open, onToggle, onOpenDoc, filter, projectOf }) => {
  const dispatch = useDispatch();
  const kind = agendaKind(agenda);
  const broken = kind === 'project' && agenda.project.missing;
  const editName = async () => {
    const t = await askText({
      title: 'Cambiar el nombre de la agenda',
      value: agenda.rawTitle || agenda.title,
      okLabel: 'Guardar',
    });
    if (t && t.trim()) dispatch(agendaEditNode(agenda.headerId, { title: t }));
  };
  const remove = (e) => {
    e.stopPropagation();
    return dispatch(agendaDeleteNode(agenda.headerId, label, agenda.points));
  };
  return (
    <li className={'gtd-people__row' + (open ? ' is-open' : '')} data-testid="gtd-agenda-row">
      <div className="gtd-people__rowhead">
        <button
          type="button"
          className={'gtd-people__name' + (broken ? ' is-broken' : '')}
          onClick={onToggle}
          aria-expanded={open}
          title={broken ? 'Proyecto no encontrado (borrado, archivado o sin :ID:)' : undefined}
          data-testid="gtd-agenda-toggle"
        >
          <i className={open ? 'fas fa-caret-down' : 'fas fa-caret-right'} />{' '}
          {kind === 'person' && <i className="fas fa-user" />}
          {kind === 'project' && <i className="fas fa-project-diagram" />} {label}
        </button>
        {agenda.open > 0 && (
          <span className="gtd-side__count" data-testid="gtd-agenda-open-count">
            {agenda.open}
          </span>
        )}
        <button
          type="button"
          className="gtd-people__mini"
          title="Nueva reunión"
          onClick={() =>
            openNewMeeting(meetingDetailOf(agenda, projectOf ? projectOf(agenda) : null))
          }
          data-testid="gtd-agenda-new-meeting"
        >
          <i className="fas fa-users" />
        </button>
        {agenda.person && (
          <button
            type="button"
            className="gtd-people__mini"
            title="Ficha de la persona"
            onClick={() => openPersonCard(agenda.person.id)}
            data-testid="gtd-agenda-person-card"
          >
            <i className="far fa-address-card" />
          </button>
        )}
      </div>
      {open && (
        <>
          <AgendaBody agenda={agenda} onOpenDoc={onOpenDoc} filter={filter} />
          <div className="gtd-tickler__add gtd-people__danger">
            <button
              type="button"
              className="gtd-review__btn"
              onClick={editName}
              data-testid="gtd-agenda-rename"
            >
              <i className="fas fa-pen" /> Cambiar nombre
            </button>
            <button
              type="button"
              className="gtd-review__btn is-danger"
              onClick={remove}
              data-testid="gtd-agenda-delete"
            >
              <i className="fas fa-trash" /> Eliminar agenda
            </button>
          </div>
        </>
      )}
    </li>
  );
};

// (4.60) Filtro por tipo de la página Agendas
const KINDS = [
  { id: 'all', label: 'Todas' },
  { id: 'person', label: 'Personas' },
  { id: 'place', label: 'Lugares' },
  { id: 'project', label: 'Proyectos' },
];

// Página «Agendas»: personas, lugares/ocasiones y (4.60) proyectos; cada una, plegable, con su árbol
export const AgendasPage = ({ agendas, loaded, onOpenDoc, filter = '', projectOf = null }) => {
  const [openId, setOpenId] = useState(null);
  const [kind, setKind] = useState('all');
  const words = filterWords(filter);
  const toggle = (id) => setOpenId((x) => (x === id ? null : id));
  if (!loaded)
    return (
      <div className="gtd-empty" data-testid="gtd-agendas-nofile">
        <p>No se encuentra agendas.org (se elige en Ajustes › GTD › Ficheros).</p>
      </div>
    );
  // (4.57) con un filtro: solo las agendas cuyo título, notas o puntos coinciden; las que coinciden
  // solo por dentro (en un punto) salen abiertas
  const list = (items) => (
    <ul className="gtd-people__list">
      {items
        .filter((a) => nodeMatchesDeep(a, words))
        .map((a) => (
          <AgendaRow
            key={a.headerId}
            agenda={a}
            label={agendaLabel(a)}
            open={openId === a.headerId || (words.length > 0 && !nodeMatches(a, words))}
            onToggle={() => toggle(a.headerId)}
            onOpenDoc={onOpenDoc}
            filter={filter}
            projectOf={projectOf}
          />
        ))}
    </ul>
  );
  const shown = (items, k) =>
    (kind === 'all' || kind === k) && items.filter((a) => nodeMatchesDeep(a, words)).length > 0;
  const projects = agendas.projects || [];
  const any =
    shown(agendas.persons, 'person') ||
    shown(agendas.places, 'place') ||
    shown(projects, 'project');
  return (
    <div className="gtd-people" data-testid="gtd-agendas">
      {!!agendas.all.length && (
        <div className="gtd-people__kinds" role="tablist" data-testid="gtd-agendas-kinds">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={kind === k.id}
              className={'gtd-chip gtd-people__kind' + (kind === k.id ? ' is-on' : '')}
              onClick={() => setKind(k.id)}
              data-testid={`gtd-agendas-kind-${k.id}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      {shown(agendas.persons, 'person') && (
        <>
          <div className="gtd-review__sub">
            <i className="fas fa-user-friends" /> Personas
          </div>
          {list(agendas.persons)}
        </>
      )}
      {shown(agendas.places, 'place') && (
        <>
          <div className="gtd-review__sub">
            <i className="fas fa-map-marker-alt" /> Lugares y ocasiones
          </div>
          {list(agendas.places)}
        </>
      )}
      {shown(projects, 'project') && (
        <>
          <div className="gtd-review__sub" data-testid="gtd-agendas-projects">
            <i className="fas fa-project-diagram" /> Proyectos
          </div>
          {list(projects)}
        </>
      )}
      {!agendas.all.length && (
        <div className="gtd-empty">
          <p>agendas.org no tiene ninguna agenda todavía.</p>
        </div>
      )}
      {!!agendas.all.length && !any && (
        <div className="gtd-empty" data-testid="gtd-agendas-nomatch">
          <p>
            {words.length
              ? `Ninguna agenda coincide con «${filter.trim()}».`
              : 'No hay agendas de este tipo.'}
          </p>
        </div>
      )}
    </div>
  );
};

// ---------------- (4.60) Reuniones de una persona o de un proyecto ----------------

// reuniones.org cargado en silencio (sin crearlo) → { path, file }
const useReuniones = () => {
  const dispatch = useDispatch();
  const store = useStore();
  const path = reunionesPathFor(store.getState());
  const file = useSelector((st) => st.org.present.getIn(['files', path]));
  const loaded = !!(file && file.get('headers'));
  useEffect(() => {
    if (!loaded) Promise.resolve(dispatch(loadFileQuietly(path))).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return { path, file };
};

/**
 * Sección «Reuniones»: las de reuniones.org con esa persona (:PERSONA:) o de ese proyecto
 * (:PROYECTO:), de la más reciente a la más antigua; las 5 últimas y «Ver todas» (con lupa).
 * Tocar = abrir en Documentos. Lápiz = cambiar el título; papelera = eliminar (con confirmación).
 */
export const MeetingsSection = ({ personId = null, projectId = null, onOpened = null }) => {
  const dispatch = useDispatch();
  const { path, file } = useReuniones();
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(
    () => (personId || projectId ? meetingsIn(file, path, { personId, projectId }) : []),
    [file, path, personId, projectId]
  );
  const shown = all ? filterMeetings(list, q) : list.slice(0, 5);
  const open = (m) => {
    if (onOpened) onOpened();
    dispatch(openHeadingInDocs({ path, headerId: m.headerId }));
  };
  const rename = async (m) => {
    const t = await askText({ title: 'Título de la reunión', value: m.title, okLabel: 'Guardar' });
    if (t && t.trim()) dispatch(renameHeading(path, m.headerId, t));
  };
  return (
    <div className="gtd-meetings" data-testid="gtd-meetings">
      {!list.length && <div className="gtd-people__hint">Ninguna reunión todavía.</div>}
      <ul className="gtd-people__list">
        {shown.map((m) => (
          <li key={m.headerId} className="gtd-people__row" data-testid="gtd-meeting-row">
            <div className="gtd-people__rowhead">
              <button
                type="button"
                className="gtd-people__name"
                onClick={() => open(m)}
                data-testid="gtd-meeting-open"
              >
                <i className="fas fa-users" /> {m.title}
                {m.date && !m.title.includes(m.date) && (
                  <small className="gtd-people__hint"> {m.date}</small>
                )}
              </button>
              <button
                type="button"
                className="gtd-people__mini"
                title="Cambiar el título"
                onClick={() => rename(m)}
                data-testid="gtd-meeting-rename"
              >
                <i className="fas fa-pen" />
              </button>
              <button
                type="button"
                className="gtd-people__mini"
                title="Eliminar la reunión"
                onClick={() =>
                  dispatch(
                    deleteHeading({
                      path,
                      headerId: m.headerId,
                      what: 'la reunión',
                      title: m.title,
                    })
                  )
                }
                data-testid="gtd-meeting-delete"
              >
                <i className="fas fa-trash" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {list.length > 5 && !all && (
        <button
          type="button"
          className="gtd-review__btn"
          onClick={() => setAll(true)}
          data-testid="gtd-meetings-all"
        >
          Ver todas ({list.length})
        </button>
      )}
      {all && (
        <div className="gtd-tickler__add">
          <i className="fas fa-search" />
          <input
            type="text"
            className="gtd-tickler__input gtd-tickler__new"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar reunión…"
            data-testid="gtd-meetings-filter"
          />
        </div>
      )}
    </div>
  );
};

/**
 * (4.60) En el detalle de un proyecto: su «Agenda» (puntos a tratar, plegada si no hay abiertos) y
 * sus «Reuniones», con «Nueva reunión». `project` = tarea del modelo; `agenda` = la suya o null.
 */
export const ProjectPeopleBlock = ({ project, agenda, onOpenDoc }) => {
  const dispatch = useDispatch();
  const store = useStore();
  const [agOpen, setAgOpen] = useState(() => !!(agenda && agenda.points > 0));
  const [mtOpen, setMtOpen] = useState(false);
  const newMeeting = () =>
    openNewMeeting({
      persons: [],
      project,
      agendaId: agenda ? agenda.headerId : null,
      agendaName: project.title,
    });
  const createAgenda = async () => {
    const id = await dispatch(createProjectAgenda(project));
    if (id) setAgOpen(true);
  };
  return (
    <div className="gtd-projpeople" data-testid="gtd-project-people">
      <div className="gtd-projpeople__head">
        <button
          type="button"
          className="gtd-people__name"
          onClick={() => (agenda ? setAgOpen(!agOpen) : createAgenda())}
          aria-expanded={agenda ? agOpen : undefined}
          data-testid="gtd-project-agenda-toggle"
        >
          {agenda ? (
            <>
              <i className={agOpen ? 'fas fa-caret-down' : 'fas fa-caret-right'} />{' '}
              <i className="far fa-comments" /> Agenda
              {agenda.open > 0 && <span className="gtd-side__count">{agenda.open}</span>}
            </>
          ) : (
            <>
              <i className="fas fa-plus" /> <i className="far fa-comments" /> Agenda del proyecto
            </>
          )}
        </button>
        <button
          type="button"
          className="gtd-people__name"
          onClick={() => setMtOpen(!mtOpen)}
          aria-expanded={mtOpen}
          data-testid="gtd-project-meetings-toggle"
        >
          <i className={mtOpen ? 'fas fa-caret-down' : 'fas fa-caret-right'} />{' '}
          <i className="fas fa-users" /> Reuniones
        </button>
        <button
          type="button"
          className="gtd-people__mini"
          title="Nueva reunión"
          onClick={newMeeting}
          data-testid="gtd-project-new-meeting"
        >
          <i className="fas fa-plus" />
        </button>
      </div>
      {agenda && agOpen && (
        <AgendaBody
          agenda={agenda}
          testId="gtd-project-agenda"
          onOpenDoc={
            onOpenDoc
              ? (n) => onOpenDoc({ path: agendasPathFor(store.getState()), headerId: n.headerId })
              : null
          }
        />
      )}
      {mtOpen && <MeetingsSection projectId={project.orgId || null} />}
    </div>
  );
};

// Página «Personas»: los contactos (tocar = ficha) y «Nuevo contacto»
export const PersonsPage = ({ contacts, loaded, countOf, filter = '' }) => {
  const dispatch = useDispatch();
  const words = filterWords(filter);
  const shownContacts = contacts.filter((c) => contactMatches(c, words));
  const add = async () => {
    const name = await askText({
      title: 'Nuevo contacto',
      placeholder: 'Nombre',
      okLabel: 'Crear',
    });
    if (!name || !name.trim()) return;
    const p = await dispatch(createContact(name));
    if (p) openPersonCard(p.id);
  };
  return (
    <div className="gtd-people" data-testid="gtd-persons">
      <div className="gtd-tickler__add">
        <button
          type="button"
          className="gtd-review__btn"
          onClick={add}
          data-testid="gtd-person-new"
        >
          <i className="fas fa-user-plus" /> Nuevo contacto
        </button>
      </div>
      {!loaded && (
        <div className="gtd-empty">
          <p>No se encuentra personas.org (se crea al añadir el primer contacto).</p>
        </div>
      )}
      <ul className="gtd-people__list">
        {shownContacts.map((c) => (
          <li key={c.headerId} className="gtd-people__row" data-testid="gtd-person-row">
            <div className="gtd-people__rowhead">
              <button
                type="button"
                className="gtd-people__name"
                onClick={() => c.orgId && openPersonCard(c.orgId)}
                disabled={!c.orgId}
                title={c.orgId ? 'Ver la ficha' : 'Sin :ID: (se pone al enlazarlo)'}
              >
                <i className="fas fa-user" /> {c.name}
                {(c.empresa || c.email) && (
                  <small className="gtd-people__hint">
                    {' '}
                    {[c.empresa, c.email].filter(Boolean).join(' · ')}
                  </small>
                )}
              </button>
              {countOf && countOf(c) > 0 && <span className="gtd-side__count">{countOf(c)}</span>}
            </div>
          </li>
        ))}
      </ul>
      {loaded && !!contacts.length && !shownContacts.length && (
        <div className="gtd-empty" data-testid="gtd-persons-nomatch">
          <p>Ningún contacto coincide con «{filter.trim()}».</p>
        </div>
      )}
    </div>
  );
};
