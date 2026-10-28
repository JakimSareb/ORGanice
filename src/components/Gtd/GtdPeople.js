// ORG Mode para Eli (4.48): Personas y Agendas en la vista GTD (páginas del menú lateral) y el
// cuerpo de una agenda (casillas, «Añadir punto»), que también sale en la ficha de la persona.
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { bodyLines } from '../../lib/gtd/gtd_agendas';
import {
  agendaAddPoint,
  agendaToggle,
  agendaItemToContact,
  createContact,
  openPersonCard,
} from '../../lib/gtd/gtd_persons_actions';
import { askText } from '../../lib/eli_prompt';
import { OrgText } from '../EliHeadingViews/OrgRender';

// ¿El texto de un ítem parece un nombre (para «Convertir en contacto»)?
const looksLikeName = (text) => {
  const t = String(text || '').trim();
  return !!t && t.length <= 40 && !/\[\[|https?:|[:;?!]/.test(t) && t.split(/\s+/).length <= 4;
};

// Cuerpo de una agenda tal cual: ítems (con su casilla marcable) y párrafos; «Añadir punto»
export const AgendaBody = ({ agenda, onOpenDoc = null, testId = 'gtd-agenda-body' }) => {
  const dispatch = useDispatch();
  const [text, setText] = useState('');
  const add = async () => {
    const t = text.trim();
    if (!t) return;
    if (await dispatch(agendaAddPoint({ headerId: agenda.headerId }, t))) setText('');
  };
  const lines = bodyLines(agenda.body);
  return (
    <div className="gtd-people__agenda" data-testid={testId}>
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
                  onClick={() => dispatch(agendaToggle(agenda.headerId, i))}
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
              {looksLikeName(item.text) && (
                <button
                  type="button"
                  className="gtd-people__mini"
                  title="Convertir en contacto (personas.org)"
                  onClick={() => dispatch(agendaItemToContact(agenda.headerId, i))}
                  data-testid="gtd-agenda-to-contact"
                >
                  <i className="fas fa-user-plus" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
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
            onClick={onOpenDoc}
            data-testid="gtd-agenda-open-doc"
          >
            <i className="fas fa-external-link-alt" /> Abrir en Documentos
          </button>
        )}
      </form>
    </div>
  );
};

const AgendaRow = ({ agenda, label, open, onToggle, onOpenDoc }) => (
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
    {open && <AgendaBody agenda={agenda} onOpenDoc={() => onOpenDoc(agenda)} />}
  </li>
);

// Página «Agendas»: personas primero, luego ocasiones agrupadas por su madre
export const AgendasPage = ({ agendas, loaded, onOpenDoc }) => {
  const [openId, setOpenId] = useState(null);
  const toggle = (id) => setOpenId((x) => (x === id ? null : id));
  if (!loaded)
    return (
      <div className="gtd-empty" data-testid="gtd-agendas-nofile">
        <p>No se encuentra agendas.org (se elige en Ajustes › GTD › Ficheros).</p>
      </div>
    );
  return (
    <div className="gtd-people" data-testid="gtd-agendas">
      {agendas.persons.length > 0 && (
        <>
          <div className="gtd-review__sub">
            <i className="fas fa-user-friends" /> Personas
          </div>
          <ul className="gtd-people__list">
            {agendas.persons.map((a) => (
              <AgendaRow
                key={a.headerId}
                agenda={a}
                label={a.person.name}
                open={openId === a.headerId}
                onToggle={() => toggle(a.headerId)}
                onOpenDoc={onOpenDoc}
              />
            ))}
          </ul>
        </>
      )}
      {agendas.groups.map((g) => (
        <React.Fragment key={g.headerId}>
          <div className="gtd-review__sub">
            <i className="fas fa-map-marker-alt" /> {g.title || 'Ocasiones'}
          </div>
          <ul className="gtd-people__list">
            {g.items.map((a) => (
              <AgendaRow
                key={a.headerId}
                agenda={a}
                label={a.title}
                open={openId === a.headerId}
                onToggle={() => toggle(a.headerId)}
                onOpenDoc={onOpenDoc}
              />
            ))}
          </ul>
        </React.Fragment>
      ))}
      {!agendas.all.length && (
        <div className="gtd-empty">
          <p>agendas.org no tiene ninguna agenda todavía.</p>
        </div>
      )}
    </div>
  );
};

// Página «Personas»: los contactos (tocar = ficha) y «Nuevo contacto»
export const PersonsPage = ({ contacts, loaded, countOf }) => {
  const dispatch = useDispatch();
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
        {contacts.map((c) => (
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
    </div>
  );
};
