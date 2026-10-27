import React, { Fragment, useState } from 'react';

import './stylesheet.css';

import AttributedString from '../../../AttributedString';
import { parseRefs } from '../../../../../../lib/eli_roam';

// (4.41) :ROAM_REFS: de org-roam: cada URL, un enlace (las citas «@clave», como texto)
const roamRefs = (item) => {
  const v = item.get('value');
  const text =
    v && v.map ? v.map((p) => p.get('contents') || '').join('') : typeof v === 'string' ? v : '';
  return (
    <span className="property-list__refs" data-testid="eli-roam-refs">
      {parseRefs(text).map((r, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' '}
          {r.url ? (
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {r.url}
            </a>
          ) : (
            r.text
          )}
        </React.Fragment>
      ))}
    </span>
  );
};

export default ({ propertyListItems, shouldDisableActions, onTimestampClick, onEdit }) => {
  const [isDrawerCollapsed, setIsDrawerCollapsed] = useState(true);

  const handleCollapseToggle = () => setIsDrawerCollapsed(!isDrawerCollapsed);

  return propertyListItems.size === 0 ? null : (
    <div className="property-list-container">
      <div
        className="property-list__property"
        onClick={handleCollapseToggle}
        data-testid="property-list-properties-toggle"
      >
        :PROPERTIES:
        {isDrawerCollapsed ? '...' : ''}
      </div>

      {!isDrawerCollapsed && (
        <Fragment>
          {propertyListItems.map((propertyListItem, index) => (
            <div className="property-list__item-container" key={propertyListItem.get('id')}>
              <div
                className="property-list__property"
                onClick={shouldDisableActions ? null : onEdit}
                data-testid={`property-list-item-property-${index}`}
              >
                :{propertyListItem.get('property')}:
              </div>
              <div
                className="property-list__value"
                data-testid={`property-list-item-value-${index}`}
              >
                {(propertyListItem.get('property') || '').toUpperCase() === 'ROAM_REFS' ? (
                  roamRefs(propertyListItem)
                ) : (
                  <AttributedString
                    parts={propertyListItem.get('value') || []}
                    subPartDataAndHandlers={{
                      onTimestampClick,
                      shouldDisableActions,
                    }}
                  />
                )}
              </div>
            </div>
          ))}

          <div className="property-list__property" onClick={onEdit} data-testid="property-list-end">
            :END:
          </div>
        </Fragment>
      )}
    </div>
  );
};
