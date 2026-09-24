import React, { useState } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import './stylesheet.css';

import AgendaDay from './components/AgendaDay';
import TabButtons from '../../../UI/TabButtons';
import ContextFilterBar from '../ContextFilterBar';
import TitleLine from '../TitleLine';
import { getPriority } from '../../../../lib/eli_priority';
import { isTodoKeywordCompleted } from '../../../../lib/org_utils';
import { filterFilesByContexts, filterFilesByTodo } from '../../../../lib/gtd_contexts';

import { isMobileBrowser } from '../../../../lib/browser_utils';
import * as baseActions from '../../../../actions/base';
import * as orgActions from '../../../../actions/org';
import { determineIncludedFiles } from '../../../../reducers/org';

import _ from 'lodash';
import {
  addDays,
  addWeeks,
  addMonths,
  getDay,
  subDays,
  subWeeks,
  subMonths,
  startOfWeek,
  startOfMonth,
  getDaysInMonth,
} from 'date-fns';
import format from 'date-fns/format';

// INFO: SearchModal, AgendaModal and TaskListModal are very similar
// in structure and partially in logic. When changing one, consider
// changing all.
function AgendaModal(props) {
  const {
    files,
    todoKeywordSets,
    agendaTimeframe,
    agendaDefaultDeadlineDelayValue,
    agendaDefaultDeadlineDelayUnit,
    agendaStartOnWeekday,
    orgHabitShowAllToday,
    orgHabitPrecedingDays,
    orgHabitFollowingDays,
  } = props;

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateDisplayType, setDateDisplayType] = useState('absolute');
  // ORG Mode para Eli: modo Log (mostrar/ocultar tareas terminadas según su CLOSED:)
  const [showLog, setShowLog] = useState(() => {
    try {
      return window.localStorage.getItem('eliAgendaLog') === 'true';
    } catch (e) {
      return false;
    }
  });
  function toggleLog() {
    const next = !showLog;
    setShowLog(next);
    try {
      window.localStorage.setItem('eliAgendaLog', String(next));
    } catch (e) {}
  }

  const weekStartsOn = agendaStartOnWeekday < 0 ? getDay(selectedDate) : agendaStartOnWeekday;

  function handleTimeframeTypeChange(agendaTimeframe) {
    props.base.setAgendaTimeframe(agendaTimeframe);
  }

  function handleNextDateClick() {
    switch (agendaTimeframe) {
      case 'Day':
        setSelectedDate(addDays(selectedDate, 1));
        break;
      case 'Week':
        setSelectedDate(addWeeks(selectedDate, 1));
        break;
      case 'Month':
        setSelectedDate(addMonths(selectedDate, 1));
        break;
      default:
        return '';
    }
  }

  function handleHeaderClick(path, headerId) {
    props.onClose();
    props.org.selectHeaderAndOpenParents(path, headerId, { widen: true });
  }

  function handlePreviousDateClick() {
    switch (agendaTimeframe) {
      case 'Day':
        setSelectedDate(subDays(selectedDate, 1));
        break;
      case 'Week':
        setSelectedDate(subWeeks(selectedDate, 1));
        break;
      case 'Month':
        setSelectedDate(subMonths(selectedDate, 1));
        break;
      default:
        return '';
    }
  }

  function handleToggleDateDisplayType() {
    setDateDisplayType(dateDisplayType === 'absolute' ? 'relative' : 'absolute');
  }

  function calculateTimeframeHeader() {
    switch (agendaTimeframe) {
      case 'Day':
        return format(selectedDate, 'MMMM do');
      case 'Week':
        const weekStart = startOfWeek(selectedDate, { weekStartsOn });
        const weekEnd = addWeeks(weekStart, 1);
        return `${format(weekStart, 'MMM do')} - ${format(weekEnd, 'MMM do')} (W${format(
          weekStart,
          'w'
        )})`;
      case 'Month':
        return format(selectedDate, 'MMMM');
      default:
        return '';
    }
  }

  // ORG Mode para Eli: tareas con prioridad arriba del todo (A primero)
  function renderPriorityTasks() {
    const items = [];
    files.forEach((file, filePath) => {
      const sets = file.get('todoKeywordSets');
      (file.get('headers') || []).forEach((header) => {
        const priority = getPriority(header);
        if (!priority) return;
        const kw = header.getIn(['titleLine', 'todoKeyword']);
        if (kw && sets && isTodoKeywordCompleted(sets, kw)) return;
        items.push({ priority, header: header.set('path', filePath) });
      });
    });
    if (!items.length) return null;
    items.sort((a, b) => a.priority.localeCompare(b.priority));
    return (
      <div className="agenda__priority" data-testid="eli-agenda-priority">
        <div className="agenda__priority-title">
          <i className="fas fa-star" /> Prioritarias ({items.length})
        </div>
        {items.map(({ header }) => (
          <div key={`${header.get('path')}-${header.get('id')}`} className="agenda__priority-item">
            <TitleLine
              header={header}
              color="var(--base03)"
              hasContent={false}
              isSelected={false}
              shouldDisableActions
              shouldDisableExplicitWidth
              onClick={() => handleHeaderClick(header.get('path'), header.get('id'))}
            />
          </div>
        ))}
      </div>
    );
  }

  let dates = [];
  switch (agendaTimeframe) {
    case 'Day':
      dates = [selectedDate];
      break;
    case 'Week':
      const weekStart = startOfWeek(selectedDate, { weekStartsOn });
      dates = _.range(7).map((daysAfter) => addDays(weekStart, daysAfter));
      break;
    case 'Month':
      const monthStart = startOfMonth(selectedDate);
      dates = _.range(getDaysInMonth(selectedDate)).map((daysAfter) =>
        addDays(monthStart, daysAfter)
      );
      break;
    default:
  }

  return (
    <>
      <h2 className="agenda__title">Agenda</h2>

      <div className="agenda__tab-container">
        <TabButtons
          buttons={['Day', 'Week', 'Month']}
          selectedButton={agendaTimeframe}
          onSelect={handleTimeframeTypeChange}
          useEqualWidthTabs
        />
      </div>

      <ContextFilterBar />

      {renderPriorityTasks()}

      <div className="agenda__timeframe-header-container">
        <i className="fas fa-chevron-left fa-lg" onClick={handlePreviousDateClick} />
        <div className="agenda__timeframe-header">{calculateTimeframeHeader()}</div>
        <i className="fas fa-chevron-right fa-lg" onClick={handleNextDateClick} />
        <button
          className={'agenda__log-toggle' + (showLog ? ' is-active' : '')}
          onClick={toggleLog}
          aria-pressed={showLog}
          title="Log: mostrar u ocultar las tareas terminadas en su fecha CLOSED:"
          data-testid="eli-agenda-log-toggle"
        >
          <i className="fas fa-check" /> Log
        </button>
      </div>

      <div
        className="agenda__days-container"
        style={isMobileBrowser ? undefined : { overflow: 'auto' }}
      >
        {dates.map((date) => (
          <AgendaDay
            key={format(date, 'yyyy MM dd')}
            date={date}
            files={files}
            onHeaderClick={handleHeaderClick}
            todoKeywordSets={todoKeywordSets}
            dateDisplayType={dateDisplayType}
            onToggleDateDisplayType={handleToggleDateDisplayType}
            agendaDefaultDeadlineDelayValue={agendaDefaultDeadlineDelayValue}
            agendaDefaultDeadlineDelayUnit={agendaDefaultDeadlineDelayUnit}
            orgHabitShowAllToday={orgHabitShowAllToday}
            orgHabitPrecedingDays={orgHabitPrecedingDays}
            orgHabitFollowingDays={orgHabitFollowingDays}
            expandOverdueByDefault={agendaTimeframe === 'Day'}
            showLog={showLog}
            logFiles={props.logFiles}
          />
        ))}
      </div>

      <br />
    </>
  );
}

const mapStateToProps = (state) => {
  const path = state.org.present.get('path');
  const file = state.org.present.getIn(['files', path]);
  const allFiles = state.org.present.get('files');
  const fileSettings = state.org.present.get('fileSettings');
  const agendaStartOnWeekday = state.base.get('agendaStartOnWeekday');
  return {
    // El Log muestra las terminadas aunque haya un filtro de estado (TODO, NEXT…)
    logFiles: filterFilesByContexts(
      determineIncludedFiles(allFiles, fileSettings, path, 'includeInAgenda', false),
      state.org.present.get('contextFilter')
    ),
    files: filterFilesByTodo(
      filterFilesByContexts(
        determineIncludedFiles(allFiles, fileSettings, path, 'includeInAgenda', false),
        state.org.present.get('contextFilter')
      ),
      state.org.present.get('todoFilter')
    ),
    todoKeywordSets: !!file ? file.get('todoKeywordSets') : null,
    agendaTimeframe: state.base.get('agendaTimeframe'),
    agendaDefaultDeadlineDelayValue: state.base.get('agendaDefaultDeadlineDelayValue') || 5,
    agendaDefaultDeadlineDelayUnit: state.base.get('agendaDefaultDeadlineDelayUnit') || 'd',
    agendaStartOnWeekday: agendaStartOnWeekday == null ? 1 : +agendaStartOnWeekday,
    orgHabitShowAllToday: state.base.get('orgHabitShowAllToday'),
    orgHabitPrecedingDays: state.base.get('orgHabitPrecedingDays') || 21,
    orgHabitFollowingDays: state.base.get('orgHabitFollowingDays') || 7,
  };
};

const mapDispatchToProps = (dispatch) => ({
  org: bindActionCreators(orgActions, dispatch),
  base: bindActionCreators(baseActions, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(AgendaModal);
