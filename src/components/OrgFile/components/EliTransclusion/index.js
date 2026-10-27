import React, { createContext, useContext, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import './stylesheet.css';

import {
  parseTransclude,
  resolveTransclusion,
  transclusionGuard,
  MAX_TRANSCLUSION_DEPTH,
} from '../../../../lib/eli_transclude';
import { OrgText, OrgTitle } from '../../../EliHeadingViews/OrgRender';
import { MediaPathContext } from '../EliMedia';
import { eliFollowOrgLink, openHeader } from '../../../../actions/org';
import { activatePopup } from '../../../../actions/base';

// (4.42) «Citar» (transclusión tipo org-transclusion): la línea `#+transclude: [[id:X]]` de las
// notas se pinta como un bloque de SOLO LECTURA con el contenido del origen. El fichero solo
// guarda esa línea. Cadena de IDs de las citas que se están pintando (ciclos y profundidad).
const TransclusionChain = createContext([]);

const fileName = (path) =>
  String(path || '')
    .split('/')
    .pop();

const Notice = ({ testId, children }) => (
  <div className="eli-transclusion eli-transclusion--notice" data-testid={testId}>
    {children}
  </div>
);

export default function EliTransclusion({ line }) {
  const spec = useMemo(() => parseTransclude(line), [line]);
  const files = useSelector((s) => s.org.present.get('files'));
  const chain = useContext(TransclusionChain);
  const dispatch = useDispatch();
  const guard = spec && spec.id ? transclusionGuard(spec.id, chain) : null;
  const res = useMemo(() => (spec && !guard ? resolveTransclusion(files, spec) : null), [
    files,
    spec,
    guard,
  ]);

  if (!spec) return <span>{line}</span>;
  if (!spec.id) {
    return (
      <Notice testId="eli-transclusion-unsupported">
        Solo se pueden citar enlaces por ID: <code>#+transclude: [[id:…]]</code>
      </Notice>
    );
  }
  if (guard === 'cycle') {
    return (
      <Notice testId="eli-transclusion-cycle">
        Cita circular: este contenido ya se está mostrando más arriba.
      </Notice>
    );
  }
  if (guard === 'depth') {
    return (
      <Notice testId="eli-transclusion-depth">
        Citas dentro de citas: máximo {MAX_TRANSCLUSION_DEPTH} niveles.
      </Notice>
    );
  }
  if (!res || !res.ok) {
    return (
      <Notice testId="eli-transclusion-missing">
        No se encuentra el origen de la cita (<code>id:{spec.id}</code>). Mira Herramientas ›
        Enlaces rotos.
      </Notice>
    );
  }

  const uri = `id:${spec.id}`;
  const follow = (e) => {
    e.stopPropagation();
    dispatch(eliFollowOrgLink(uri));
  };
  const editOrigin = async (e) => {
    e.stopPropagation();
    await dispatch(eliFollowOrgLink(uri));
    if (res.headerId) {
      dispatch(openHeader(res.headerId));
      dispatch(activatePopup('description-editor'));
    }
  };
  const baseLevel = res.blocks.length ? res.blocks[0].level : 1;
  // la cabecera citada se ve como primer bloque (con su título); si no, el título va arriba
  const titleInBody = res.kind === 'heading' && !spec.onlyContents;

  return (
    <div
      className="eli-transclusion"
      data-testid="eli-transclusion"
      data-eli-transclude={spec.id}
      contentEditable={false}
    >
      <div className="eli-transclusion__cap">
        {!titleInBody && (
          <span
            className="eli-org-link eli-transclusion__title"
            role="link"
            tabIndex={0}
            data-testid="eli-transclusion-title"
            onClick={follow}
          >
            {res.title}
          </span>
        )}
        <span className="eli-transclusion__src">{fileName(res.path)}</span>
        <button
          type="button"
          className="eli-transclusion__edit eli-no-print"
          data-testid="eli-transclusion-edit"
          onClick={editOrigin}
        >
          Editar origen
        </button>
      </div>
      <TransclusionChain.Provider value={[...chain, spec.id]}>
        <MediaPathContext.Provider value={res.path}>
          <div className="eli-transclusion__body">
            {res.blocks.map((b, i) => (
              <div
                key={i}
                className="eli-transclusion__block"
                style={{ marginLeft: Math.max(0, b.level - baseLevel) * 14 }}
              >
                {b.rawTitle !== null && (
                  <div
                    className={`eli-transclusion__h eli-transclusion__h--${Math.min(6, b.level)}`}
                    data-testid="eli-transclusion-heading"
                  >
                    {b.keyword && <span className="eli-transclusion__kw">{b.keyword} </span>}
                    {titleInBody && i === 0 ? (
                      <span
                        className="eli-org-link"
                        role="link"
                        tabIndex={0}
                        data-testid="eli-transclusion-title"
                        onClick={follow}
                      >
                        <OrgTitle rawTitle={b.rawTitle} />
                      </span>
                    ) : (
                      <OrgTitle rawTitle={b.rawTitle} />
                    )}
                  </div>
                )}
                {b.text && <OrgText text={b.text} className="eli-transclusion__text" />}
              </div>
            ))}
          </div>
        </MediaPathContext.Provider>
      </TransclusionChain.Provider>
    </div>
  );
}
