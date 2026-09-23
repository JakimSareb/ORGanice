import React, { PureComponent, Fragment } from 'react';

import './stylesheet.css';

import TitleLine from '../../../TitleLine';
import HabitConsistencyGraph from '../HabitConsistencyGraph';

import {
  isTodoKeywordCompleted,
  customFormatDistanceToNow,
  getPlanningItemTypeText,
  isHabit,
  isValidHabit,
} from '../../../../../../lib/org_utils';
import {
  dateForTimestamp,
  subtractTimestampUnitFromDate,
  addTimestampUnitToDate,
} from '../../../../../../lib/timestamps';

import {
  format,
  isToday,
  startOfDay,
  endOfDay,
  isBefore,
  isAfter,
  isEqual,
  isWithinInterval,
  isPast,
  differenceInCalendarDays,
} from 'date-fns';
import classNames from 'classnames';
import { List } from 'immutable';

export default class AgendaDay extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { overdueExpanded: null };
    this.toggleOverdue = this.toggleOverdue.bind(this);
  }

  toggleOverdue() {
    this.setState({ overdueExpanded: !this.isOverdueExpanded() });
  }

  isOverdueExpanded() {
    if (this.state && this.state.overdueExpanded !== null) return this.state.overdueExpanded;
    return this.props.expandOverdueByDefault || isToday(this.props.date);
  }

  // ORG Mode para Eli: tareas abiertas cuyo SCHEDULED o DEADLINE es anterior
  // al día mostrado, con los días que llevan vencidas respecto a ese día.
  getOverdueItemsAndHeaders({ files, dateStart }) {
    const result = [];
    files.forEach((file, path) => {
      const todoKeywordSets = file.get('todoKeywordSets');
      file.get('headers').forEach((header) => {
        const todoKeyword = header.getIn(['titleLine', 'todoKeyword']);
        if (!todoKeyword || isTodoKeywordCompleted(todoKeywordSets, todoKeyword)) return;
        if (isHabit(header)) return;
        header.get('planningItems').forEach((planningItem) => {
          const type = planningItem.get('type');
          if (type !== 'DEADLINE' && type !== 'SCHEDULED') return;
          const timestamp = planningItem.get('timestamp');
          if (!timestamp.get('isActive')) return;
          const planningItemDate = dateForTimestamp(timestamp);
          if (!isBefore(planningItemDate, dateStart)) return;
          result.push({
            planningItem,
            header: header.set('path', path),
            daysOverdue: differenceInCalendarDays(dateStart, planningItemDate),
          });
        });
      });
    });
    // Más vencidas primero; a igualdad, DEADLINE antes que SCHEDULED
    return result.sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        (a.planningItem.get('type') === 'DEADLINE' ? -1 : 1) -
          (b.planningItem.get('type') === 'DEADLINE' ? -1 : 1)
    );
  }

  renderOverdue(overdue) {
    if (overdue.length === 0) return null;
    const expanded = this.isOverdueExpanded();
    return (
      <div className="agenda-day__overdue">
        <div className="agenda-day__overdue-title" onClick={this.toggleOverdue}>
          <i className={`fas fa-caret-${expanded ? 'down' : 'right'}`} /> Vencidas ({overdue.length})
        </div>
        {expanded &&
          overdue.map(({ planningItem, header, daysOverdue }) => (
            <div
              key={`${header.get('path')}-${planningItem.get('id')}`}
              className="agenda-day__overdue-item"
            >
              <div className="agenda-day__overdue-days" title={getPlanningItemTypeText(planningItem)}>
                {daysOverdue} {daysOverdue === 1 ? 'día' : 'días'}
                <span className="agenda-day__overdue-type">
                  {planningItem.get('type') === 'DEADLINE' ? 'límite' : 'programada'}{' '}
                  {format(dateForTimestamp(planningItem.get('timestamp')), 'dd/MM')}
                </span>
              </div>
              <div className="agenda-day__overdue-header">
                <TitleLine
                  header={header}
                  color="var(--base03)"
                  hasContent={false}
                  isSelected={false}
                  shouldDisableActions
                  shouldDisableExplicitWidth
                  onClick={this.handleHeaderClick(header.get('path'), header.get('id'))}
                />
              </div>
            </div>
          ))}
      </div>
    );
  }

  handleHeaderClick(path, headerId) {
    return () => this.props.onHeaderClick(path, headerId);
  }

  render() {
    const {
      date,
      files,
      dateDisplayType,
      onToggleDateDisplayType,
      agendaDefaultDeadlineDelayValue,
      agendaDefaultDeadlineDelayUnit,
      orgHabitShowAllToday,
      orgHabitPrecedingDays,
      orgHabitFollowingDays,
    } = this.props;

    const dateStart = startOfDay(date);
    const dateEnd = endOfDay(date);

    const overdue = this.getOverdueItemsAndHeaders({ files, dateStart });
    const overdueKeys = new Set(
      overdue.map(({ header, planningItem }) => `${header.get('path')}-${planningItem.get('id')}`)
    );
    // Las vencidas se muestran en su propia sección, no se repiten en la lista del día
    const planningItemsAndHeaders = this.getPlanningItemsAndHeaders({
      files,
      date,
      agendaDefaultDeadlineDelayValue,
      agendaDefaultDeadlineDelayUnit,
      dateStart,
      dateEnd,
      orgHabitShowAllToday,
    }).filter(
      ([planningItem, header]) =>
        !overdueKeys.has(`${header.get('path')}-${planningItem.get('id')}`)
    );

    return (
      <div className="agenda-day__container">
        <div className="agenda-day__title">
          {isToday(date) && <div className="agenda-day__today-indicator" />}
          <div className="agenda-day__title__day-name">{format(date, 'eeee')}</div>
          <div className="agenda-day__title__date">{format(date, 'MMMM do, yyyy')}</div>
        </div>

        <div className="agenda-day__headers-container">
          {this.renderOverdue(overdue)}
          <div>
            {planningItemsAndHeaders.map(([planningItem, header]) => {
              const planningItemDate = dateForTimestamp(planningItem.get('timestamp'));
              const hasTodoKeyword = !!header.getIn(['titleLine', 'todoKeyword']);

              const dateClassName = classNames('agenda-day__header-planning-date', {
                'agenda-day__header-planning-date--overdue':
                  hasTodoKeyword && isPast(planningItemDate),
              });

              return (
                <div key={planningItem.get('id')} className="agenda-day__header-container">
                  <div className="agenda-day__header__planning-item-container">
                    <div className="agenda-day__header-planning-type">
                      {getPlanningItemTypeText(planningItem)}
                    </div>
                    <div className={dateClassName} onClick={onToggleDateDisplayType}>
                      {dateDisplayType === 'absolute'
                        ? format(planningItemDate, 'MM/dd')
                        : customFormatDistanceToNow(planningItemDate)}

                      {planningItem.getIn(['timestamp', 'startHour']) && (
                        <Fragment>
                          <br />
                          {format(planningItemDate, 'h:mma')}
                        </Fragment>
                      )}
                    </div>
                  </div>
                  <div className="agenda-day__header__header-container">
                    <TitleLine
                      header={header}
                      color="var(--base03)"
                      hasContent={false}
                      isSelected={false}
                      shouldDisableActions
                      shouldDisableExplicitWidth
                      onClick={this.handleHeaderClick(header.get('path'), header.get('id'))}
                    />
                    {/* Show habit consistency graph for valid habits */}
                    {isValidHabit(header) && (
                      <HabitConsistencyGraph
                        header={header}
                        viewDate={date}
                        precedingDays={orgHabitPrecedingDays}
                        followingDays={orgHabitFollowingDays}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  getPlanningItemsAndHeaders({
    files,
    date,
    agendaDefaultDeadlineDelayValue,
    agendaDefaultDeadlineDelayUnit,
    dateStart,
    dateEnd,
    orgHabitShowAllToday,
  }) {
    const headers = List().concat(
      ...files
        .mapEntries(([path, file]) => [
          path,
          file.get('headers').map((header) => header.set('path', path)),
        ])
        .valueSeq()
    );
    const todoKeywordSets = files.map((file) => file.get('todoKeywordSets'));

    return headers
      .flatMap((header) => {
        const planningItemsforDate = header.get('planningItems').filter((planningItem) => {
          const timestamp = planningItem.get('timestamp');
          if (!timestamp.get('isActive')) {
            return false;
          }

          // Check if this is a habit using the utility function
          const headerIsHabit = isHabit(header);

          // When org-habit-show-all-today is enabled and viewing today:
          // Show ALL habits (even if not scheduled or completed)
          if (orgHabitShowAllToday && headerIsHabit && isToday(date)) {
            return true;
          }

          const planningItemDate = dateForTimestamp(timestamp);
          const todoKeyword = header.getIn(['titleLine', 'todoKeyword']);
          const isCompletedTodo =
            todoKeyword &&
            isTodoKeywordCompleted(todoKeywordSets.get(header.get('path')), todoKeyword);
          if (isCompletedTodo) {
            return false;
          }
          switch (planningItem.get('type')) {
            case 'DEADLINE':
              if (isToday(date)) {
                if (isBefore(planningItemDate, new Date())) {
                  return true;
                }
                const [delayValue, delayUnit] = timestamp.get('delayType')
                  ? [timestamp.get('delayValue'), timestamp.get('delayUnit')]
                  : [agendaDefaultDeadlineDelayValue, agendaDefaultDeadlineDelayUnit];
                const appearDate = subtractTimestampUnitFromDate(
                  planningItemDate,
                  delayValue,
                  delayUnit
                );
                return isAfter(date, appearDate) || isEqual(date, appearDate);
              } else {
                return isWithinInterval(planningItemDate, { start: dateStart, end: dateEnd });
              }
            case 'SCHEDULED':
              let appearDate = planningItemDate;
              if (timestamp.get('delayType')) {
                const hasBeenRepeated = header
                  .get('propertyListItems')
                  .some((propertyListItem) => propertyListItem.get('property') === 'LAST_REPEAT');
                if (timestamp.get('delayType') === '--' && !hasBeenRepeated) {
                  appearDate = addTimestampUnitToDate(
                    planningItemDate,
                    timestamp.get('delayValue'),
                    timestamp.get('delayUnit')
                  );
                }
              }
              if (isToday(date) && isAfter(date, appearDate)) {
                return true;
              }
              return isWithinInterval(appearDate, { start: dateStart, end: dateEnd });
            default:
              return isWithinInterval(planningItemDate, { start: dateStart, end: dateEnd });
          }
        });
        return planningItemsforDate.map((planningItem) => [planningItem, header]);
      })
      .sortBy(([planningItem, header]) => {
        const { startHour, startMinute, endHour, endMinute, month, day } = planningItem
          .get('timestamp')
          .toJS();
        return [
          isHabit(header) ? 0 : 1,
          startHour ? 0 : 1,
          startHour,
          startMinute,
          endHour,
          endMinute,
          month,
          day,
        ];
      });
  }
}
