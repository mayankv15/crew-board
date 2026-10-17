import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type Severity = 'success' | 'error' | 'info';

interface Undo {
  positionId: string;
  technicianId: string;
  technicianName: string;
}

interface UiState {
  selectedPositionId: string | null;
  boardSearch: string;
  announcement: { id: number; text: string; severity: Severity; undo?: Undo } | null;
  announcementOpen: boolean;
}

const initialState: UiState = {
  selectedPositionId: null,
  boardSearch: '',
  announcement: null,
  announcementOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openAssign(state, action: PayloadAction<string>) {
      state.selectedPositionId = action.payload;
    },
    closeAssign(state) {
      state.selectedPositionId = null;
    },
    rememberBoardSearch(state, action: PayloadAction<string>) {
      state.boardSearch = action.payload;
    },
    announce: {
      reducer(state, action: PayloadAction<{ text: string; severity: Severity; undo?: Undo }>) {
        state.announcement = { id: (state.announcement?.id ?? 0) + 1, ...action.payload };
        state.announcementOpen = true;
      },
      prepare: (text: string, severity: Severity = 'info', undo?: Undo) => ({
        payload: { text, severity, ...(undo ? { undo } : {}) },
      }),
    },
    dismissAnnouncement(state) {
      state.announcementOpen = false;
    },
  },
});

export const { openAssign, closeAssign, announce, dismissAnnouncement, rememberBoardSearch } = uiSlice.actions;
export default uiSlice.reducer;
