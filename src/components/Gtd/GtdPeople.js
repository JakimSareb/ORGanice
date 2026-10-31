// ORG Mode para Eli (4.48/4.50): Personas y Agendas en la vista GTD (páginas del menú lateral) y el
// árbol de una agenda (puntos = subcabeceras de agendas.org), que también sale en la ficha de la
// persona.
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
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
import { agendaToMeeting } from '../../lib/gtd/gtd_agendas_actions';
import { askText } from '../../lib/eli_prompt';
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
            className="gtd-people__check"
            aria-pressed={node.done}
            title={node.done ? 'Volver a abrir el punto' : 'Marcar como tratado'}
            onClick={() => ctl.done(node)}
            data-testid="gtd-agenda-point-done"
          >
            <i className={node.done ? 'far fa-check-circle' : 'far fa-circle'} />
          </button>
        )}
        <button
          type="button"
          className="gtd-agpoint__title"
          onClick={() => hasMore && toggleCollapsed(node.headerId)}
          aria-expanded={hasMore ? isOpen : undefined}
          data-testid="gtd-agenda-point-title"
        >
          {hasMore && <i className={isOpen ? 'fas fa-caret-down' : 'fas fa-caret-right'} />}{' '}
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

const AgendaRow = ({ agenda, label, open, onToggle, onOpenDoc, filter }) => (
  <li className={'gtd-people__row' + (open ? ' is-open' : '')} data-testid="gtd-agenda-row">
    <div className="gtd-people__rowhead">
      <button
        type="button"
        className="gtd-people__name"
        onClick={onToggle}
        aria-expanded={open}
        data-testid="gtd-agenda-toggle"
      >
        <i className={open ? 'fas fa-caret-down' : 'fas fa-caret-right'} />{' '}
        {agenda.person && <i className="fas fa-user" />} {label}
      </button>
      {agenda.open > 0 && (
        <span className="gtd-side__count" data-testid="gtd-agenda-open-count">
          {agenda.open}
        </span>
      )}
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
    {open && <AgendaBody agenda={agenda} onOpenDoc={onOpenDoc} filter={filter} />}
  </li>
);

// Página «Agendas»: personas primero y luego lugares/ocasiones; cada una, plegable, con su árbol
export const AgendasPage = ({ agendas, loaded, onOpenDoc, filter = '' }) => {
  const [openId, setOpenId] = useState(null);
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
  const list = (items, label) => (
    <ul className="gtd-people__list">
      {items
        .filter((a) => nodeMatchesDeep(a, words))
        .map((a) => (
          <AgendaRow
            key={a.headerId}
            agenda={a}
            label={label(a)}
            open={openId === a.headerId || (words.length > 0 && !nodeMatches(a, words))}
            onToggle={() => toggle(a.headerId)}
            onOpenDoc={onOpenDoc}
            filter={filter}
          />
        ))}
    </ul>
  );
  const shown = (items) => items.filter((a) => nodeMatchesDeep(a, words)).length > 0;
  return (
    <div className="gtd-people" data-testid="gtd-agendas">
      {shown(agendas.persons) && (
        <>
          <div className="gtd-review__sub">
            <i className="fas fa-user-friends" /> Personas
          </div>
          {list(agendas.persons, (a) => a.person.name)}
        </>
      )}
      {shown(agendas.places) && (
        <>
          <div className="gtd-review__sub">
            <i className="fas fa-map-marker-alt" /> Lugares y ocasiones
          </div>
          {list(agendas.places, (a) => a.title)}
        </>
      )}
      {!agendas.all.length && (
        <div className="gtd-empty">
          <p>agendas.org no tiene ninguna agenda todavía.</p>
        </div>
      )}
      {!!agendas.all.length && !shown(agendas.all) && (
        <div className="gtd-empty" data-testid="gtd-agendas-nomatch">
          <p>Ninguna agenda coincide con «{filter.trim()}».</p>
        </div>
      )}
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
