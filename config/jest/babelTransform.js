// @remove-on-eject-begin
/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end
'use strict';

const fs = require('fs');
const path = require('path');
const babelJest = require('babel-jest');

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false;
  }

  // Only the project's own React counts: a react/jsx-runtime reachable through
  // NODE_PATH (e.g. a global React 19) would produce elements this React can't render.
  try {
    const reactDir = path.dirname(
      require.resolve('react/package.json', { paths: [path.resolve(__dirname, '../..')] })
    );
    return (
      reactDir.startsWith(path.resolve(__dirname, '../..')) &&
      fs.existsSync(path.join(reactDir, 'jsx-runtime.js'))
    );
  } catch (e) {
    return false;
  }
})();

module.exports = babelJest.createTransformer({
  presets: [
    [
      require.resolve('babel-preset-react-app'),
      {
        runtime: hasJsxRuntime ? 'automatic' : 'classic',
      },
    ],
  ],
  babelrc: false,
  configFile: false,
});
