import { createStore, applyMiddleware, compose } from 'redux';
import thunk from 'redux-thunk';
import liveSync from './middleware/live_sync';
import toggleColorScheme from './middleware/toggle_color_scheme';
import doneAttachments from './middleware/done_attachments';
import subtasksDone from './middleware/subtasks_done';
import renameLinks from './middleware/rename_links';
import rootReducer from './reducers';
import { setRemoveStore } from './lib/eli_confirm_remove';

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

export default (initialState) => {
  const store = createStore(
    rootReducer,
    initialState,
    composeEnhancers(
      applyMiddleware(
        thunk,
        subtasksDone,
        liveSync,
        toggleColorScheme,
        doneAttachments,
        renameLinks
      )
    )
  );
  // (4.24) para avisar de los enlaces [[id:…]] al borrar un encabezado
  setRemoveStore(store);
  return store;
};
