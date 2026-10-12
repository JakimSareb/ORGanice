// ORG Mode para Eli (3.0): gestor de etiquetas (tecla g), como el de Nirvana: áreas y etiquetas,
// con cuántas tareas las llevan; renombrar o quitar en todas las tareas a la vez, y etiquetas nuevas
// (se añaden a las de Ajustes → «Etiquetas por defecto», como #+TAGS).
import React, { useEffect, useMemo } from 'react';
import { askText, askConfirm } from '../../lib/eli_prompt';

export default function GtdTagManager({
  tasks,
  areas,
  contextTags = [],
  onClose,
  onRenameTag,
  onDeleteTag,
  onRenameArea,
  onAddDefaultTag,
  onRemoveDefaultTag,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('[data-testid="eli-ask-text"]')) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const tagCounts = useMemo(() => {
    const n = {};
    tasks.forEach((t) =>
      (t.ownTags || []).forEach((x) => {
        if (['sleep', 'trash'].includes(x.toLowerCase())) return;
        n[x] = (n[x] || 0) + 1;
      })
    );
    contextTags.forEach((x) => (n[x] = n[x] || 0));
    return n;
  }, [tasks, contextTags]);
  const areaCounts = useMemo(() => {
    const n = {};
    tasks.forEach((t) => t.ownArea && (n[t.ownArea] = (n[t.ownArea] || 0) + 1));
    return n;
  }, [tasks]);
  const tagNames = Object.keys(tagCounts).sort((a, b) => {
    const ac = a.startsWith('@');
    const bc = b.startsWith('@');
    return ac !== bc ? (ac ? -1 : 1) : a.localeCompare(b);
  });

  const renameTag = async (tag) => {
    const to = await askText({ title: 'Renombrar etiqueta', value: tag, okLabel: 'Renombrar' });
    const name = String(to || '')
      .trim()
      .replace(/[\s:]+/g, '');
    if (!name || name === tag) return;
    onRenameTag(tag, name);
    if (contextTags.includes(tag)) {
      onRemoveDefaultTag(tag);
      onAddDefaultTag(name);
    }
  };
  const deleteTag = async (tag) => {
    const n = tagCounts[tag] || 0;
    const ok = await askConfirm({
      title: 'Quitar etiqueta',
      message: n
        ? `¿Quitar «${tag}» de ${n === 1 ? '1 tarea' : `${n} tareas`}?`
        : `¿Quitar «${tag}» de las etiquetas por defecto?`,
      okLabel: 'Quitar',
    });
    if (!ok) return;
    if (n) onDeleteTag(tag);
    if (contextTags.includes(tag)) onRemoveDefaultTag(tag);
  };
  const newTag = async () => {
    const to = await askText({ title: 'Etiqueta nueva', placeholder: '@contexto', okLabel: 'Crear' });
    const name = String(to || '')
      .trim()
      .replace(/[\s:]+/g, '');
    if (name) onAddDefaultTag(name);
  };
  const renameArea = async (a) => {
    const to = await askText({ title: 'Renombrar área', value: a, okLabel: 'Renombrar' });
    const name = String(to || '').trim();
    if (!name || name === a) return;
    onRenameArea(a, name);
  };

  return (
    <div
      className="eli-prompt__overlay gtd-keys__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="eli-prompt__box gtd-keys gtd-tagman"
        role="dialog"
        aria-label="Gestionar etiquetas"
        data-testid="gtd-tag-manager"
      >
        <div className="gtd-keys__head">
          <strong>
            <i className="fas fa-tags" /> Gestionar etiquetas
          </strong>
          <span className="gtd-keys__spacer" />
          <button type="button" className="btn" onClick={onClose} aria-label="Cerrar">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="gtd-tagman__cols">
          <section>
            <h3>Áreas</h3>
            {areas.length === 0 && (
              <div className="gtd-tagman__note">
                Aún no hay áreas. Un área aparece al ponérsela a una tarea o proyecto (campo «Área»).
              </div>
            )}
            {areas.map((a, i) => (
              <div key={a} className="gtd-tagman__row">
                <button type="button" className="gtd-tagman__name" onClick={() => renameArea(a)}>
                  <i className="far fa-folder" /> {a}
                </button>
                <span className="gtd-tagman__n">{areaCounts[a] || ''}</span>
                {i < 9 && <kbd title="Atajo para ir a esta área">⇧{i + 1}</kbd>}
                <button
                  type="button"
                  className="gtd-tagman__btn"
                  onClick={() => renameArea(a)}
                  title="Renombrar"
                >
                  <i className="fas fa-pen" />
                </button>
              </div>
            ))}
          </section>
          <section>
            <h3>
              Etiquetas
              <button
                type="button"
                className="gtd-tagman__add"
                onClick={newTag}
                data-testid="gtd-tagman-new"
              >
                + Nueva…
              </button>
            </h3>
            {tagNames.map((tag) => (
              <div key={tag} className="gtd-tagman__row" data-testid="gtd-tagman-tag">
                <button type="button" className="gtd-tagman__name" onClick={() => renameTag(tag)}>
                  <i className="fas fa-tag" /> {tag}
                </button>
                <span className="gtd-tagman__n">{tagCounts[tag] || ''}</span>
                <button
                  type="button"
                  className="gtd-tagman__btn"
                  onClick={() => renameTag(tag)}
                  title="Renombrar en todas las tareas"
                >
                  <i className="fas fa-pen" />
                </button>
                <button
                  type="button"
                  className="gtd-tagman__btn is-danger"
                  onClick={() => deleteTag(tag)}
                  title="Quitar de todas las tareas"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
