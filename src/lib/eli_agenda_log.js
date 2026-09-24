// ORG Mode para Eli: modo "Log" de la agenda (como la tecla `l` de org-agenda):
// las tareas terminadas aparecen en el día de su fecha CLOSED:.
import { dateForTimestamp } from './timestamps';

export const closedItemsForDay = (files, dateStart, dateEnd) => {
  const items = [];
  if (!files) return items;
  files.forEach((file, path) => {
    (file.get('headers') || []).forEach((header) => {
      (header.get('planningItems') || []).forEach((planningItem) => {
        if (planningItem.get('type') !== 'CLOSED') return;
        const timestamp = planningItem.get('timestamp');
        const date = dateForTimestamp(timestamp);
        if (date < dateStart || date > dateEnd) return;
        items.push({
          key: `${path}-${header.get('id')}-${planningItem.get('id')}`,
          header: header.set('path', path),
          date,
          hasTime: timestamp.get('startHour') != null && timestamp.get('startHour') !== '',
        });
      });
    });
  });
  return items.sort((a, b) => a.date - b.date);
};
