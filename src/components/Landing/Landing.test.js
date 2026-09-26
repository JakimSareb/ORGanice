import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Landing from './';

afterEach(cleanup);

test('<Landing /> renders', () => {
  const { getByTestId } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
  expect(getByTestId('landing-sign-in-hero').getAttribute('href')).toBe('/sign_in');
  expect(getByTestId('landing-live-demo-hero').getAttribute('href')).toBe('/sample');
});
