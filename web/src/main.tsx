import '@fontsource-variable/inter';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { setupListeners } from '@reduxjs/toolkit/query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router';
import { App } from './app/App.tsx';
import { makeStore } from './app/store.ts';
import { cspNonce } from './shared/csp.ts';

const store = makeStore();
setupListeners(store.dispatch);

const nonce = cspNonce();
const cache = createCache({ key: 'mui', prepend: true, ...(nonce ? { nonce } : {}) });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CacheProvider value={cache}>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </CacheProvider>
  </StrictMode>,
);
