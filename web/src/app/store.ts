import { configureStore } from '@reduxjs/toolkit';
import { api } from '../shared/api.ts';
import ui from './uiSlice.ts';

export const makeStore = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer, ui },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
