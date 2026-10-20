// (3.38) iOS pone HOY al abrir el selector de fecha: ese primer cambio no se aplica
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ScheduleField from './ScheduleField';

afterEach(cleanup);

const pad = (n) => String(n).padStart(2, '0');
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const setup = (value = '') => {
  const onChange = jest.fn();
  const r = render(<ScheduleField value={value} repeat="" onChange={onChange} />);
  fireEvent.click(r.getByTestId('gtd-editor-schedule-btn'));
  return { ...r, onChange, input: r.getByTestId('gtd-editor-scheduled') };
};

test('el «hoy» automático al abrir el selector no se aplica; lo elegido después, sí', () => {
  const { input, onChange, queryByTestId } = setup();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: todayInput() } });
  expect(onChange).not.toHaveBeenCalled();
  expect(queryByTestId('gtd-schedule-menu')).not.toBeNull();
  fireEvent.change(input, { target: { value: '2030-05-06' } });
  expect(onChange).toHaveBeenCalledWith('2030-05-06', '');
});

test('cerrar el selector sin elegir no pone fecha', () => {
  const { input, onChange } = setup();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: todayInput() } });
  fireEvent.blur(input);
  expect(onChange).not.toHaveBeenCalled();
  expect(input.value).toBe('');
});

test('con fecha puesta, cambiar a hoy se aplica', () => {
  const { input, onChange } = setup('2030-01-01');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: todayInput() } });
  expect(onChange).toHaveBeenCalledWith(todayInput(), '');
});
