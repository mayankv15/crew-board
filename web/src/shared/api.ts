import {
  AssignmentSchema,
  CandidateSchema,
  PositionSchema,
  PositionSummarySchema,
  StartSyncResponse,
  SyncRunSchema,
  pageOf,
  type Candidate,
  type Page,
  type Position,
  type PositionSort,
  type PositionSummary,
  type Skill,
  type SyncRun,
} from '@crew-board/shared';
import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs } from '@reduxjs/toolkit/query/react';
import { z } from 'zod';
import { toApiError, type ApiError } from './errors.ts';

const rawBaseQuery = fetchBaseQuery({ baseUrl: `${window.location.origin}/api`, timeout: 15_000 });

const baseQuery: BaseQueryFn<string | FetchArgs, unknown, ApiError> = async (args, api, extra) => {
  const result = await rawBaseQuery(args, api, extra);
  return result.error ? { error: toApiError(result.error) } : { data: result.data };
};

export interface BoardFilters {
  skill?: Skill;
  from?: string;
  to?: string;
  assignee?: string;
  staffing?: 'none' | 'some';
  needsReplacement?: boolean;
  minSeats?: number;
  startsWithin?: number;
}

export interface PositionsArgs extends BoardFilters {
  status: 'open' | 'filled';
  page: number;
  pageSize: number;
  sort: PositionSort;
  q?: string;
}

export interface CandidatesArgs {
  positionId: string;
  q: string;
  pageSize: number;
  assignableOnly: boolean;
}

const parsed =
  <T extends z.ZodType>(schema: T) =>
  (raw: unknown): z.infer<T> =>
    schema.parse(raw);

const PositionPage = pageOf(PositionSchema);
const CandidatePage = pageOf(CandidateSchema);

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  refetchOnMountOrArgChange: 30,
  keepUnusedDataFor: 60,
  tagTypes: ['Positions', 'Candidates', 'SyncRuns'],
  endpoints: (build) => ({
    getPositions: build.query<Page<Position>, PositionsArgs>({
      query: ({ q, ...rest }) => ({ url: '/positions', params: { ...rest, ...(q ? { q } : {}) } }),
      transformResponse: parsed(PositionPage),
      providesTags: ['Positions'],
    }),

    getPositionSummary: build.query<PositionSummary, void>({
      query: () => '/positions/summary',
      transformResponse: parsed(PositionSummarySchema),
      providesTags: ['Positions'],
    }),

    getCandidates: build.query<Page<Candidate>, CandidatesArgs>({
      query: ({ positionId, q, pageSize, assignableOnly }) => ({
        url: `/positions/${positionId}/candidates`,
        params: { ...(q ? { q } : {}), pageSize, ...(assignableOnly ? { assignableOnly: true } : {}) },
      }),
      transformResponse: parsed(CandidatePage),
      providesTags: (_r, _e, { positionId }) => [{ type: 'Candidates', id: positionId }],
    }),

    assign: build.mutation<
      z.infer<typeof AssignmentSchema>,
      { positionId: string; technicianId: string; technicianName: string }
    >({
      query: ({ positionId, technicianId }) => ({
        url: `/positions/${positionId}/assignments`,
        method: 'POST',
        body: { technicianId },
      }),
      transformResponse: parsed(AssignmentSchema),
      onQueryStarted: async ({ positionId, technicianId, technicianName }, lifecycle) => {
        const { dispatch, queryFulfilled } = lifecycle;
        const state = lifecycle.getState();
        const patches = [
          ...api.util.selectCachedArgsForQuery(state, 'getPositions').map((arg) =>
            dispatch(
              api.util.updateQueryData('getPositions', arg, (draft) => {
                const position = draft.data.find((p) => p.id === positionId);
                if (!position || position.assigned.some((a) => a.technicianId === technicianId)) return;
                position.assigned.push({
                  assignmentId: `pending-${technicianId}`,
                  technicianId,
                  name: technicianName,
                  active: true,
                });
                position.seatsRemaining = Math.max(0, position.seatsRemaining - 1);
                position.filled = position.seatsRemaining === 0;
              }),
            ),
          ),
          ...api.util
            .selectCachedArgsForQuery(state, 'getCandidates')
            .filter((arg) => arg.positionId === positionId)
            .map((arg) =>
              dispatch(
                api.util.updateQueryData('getCandidates', arg, (draft) => {
                  const row = draft.data.find((c) => c.id === technicianId);
                  if (row) row.alreadyAssigned = true;
                }),
              ),
            ),
        ];
        try {
          await queryFulfilled;
        } catch {
          for (const patch of patches) patch.undo();
        }
      },
      invalidatesTags: (_r, _e, { positionId }) => ['Positions', { type: 'Candidates', id: positionId }],
    }),

    unassign: build.mutation<void, { positionId: string; assignmentId: string }>({
      query: ({ positionId, assignmentId }) => ({
        url: `/positions/${positionId}/assignments/${assignmentId}`,
        method: 'DELETE',
      }),
      onQueryStarted: async ({ positionId, assignmentId }, lifecycle) => {
        const { dispatch, queryFulfilled } = lifecycle;
        const patches = api.util.selectCachedArgsForQuery(lifecycle.getState(), 'getPositions').map((arg) =>
          dispatch(
            api.util.updateQueryData('getPositions', arg, (draft) => {
              const position = draft.data.find((p) => p.id === positionId);
              const index = position?.assigned.findIndex((a) => a.assignmentId === assignmentId) ?? -1;
              if (!position || index < 0) return;
              const [removed] = position.assigned.splice(index, 1);
              if (removed?.active) position.seatsRemaining += 1;
              position.filled = position.seatsRemaining === 0;
            }),
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          for (const patch of patches) patch.undo();
        }
      },
      invalidatesTags: (_r, _e, { positionId }) => ['Positions', { type: 'Candidates', id: positionId }],
    }),

    getSyncRuns: build.query<SyncRun[], { limit: number }>({
      query: ({ limit }) => ({ url: '/sync/runs', params: { limit } }),
      transformResponse: parsed(z.array(SyncRunSchema)),
      providesTags: ['SyncRuns'],
    }),

    startSync: build.mutation<{ runId: string }, void>({
      query: () => ({ url: '/sync/technicians', method: 'POST' }),
      transformResponse: parsed(StartSyncResponse),
      invalidatesTags: ['SyncRuns'],
    }),
  }),
});

export const {
  useGetPositionsQuery,
  useGetPositionSummaryQuery,
  useGetCandidatesQuery,
  useAssignMutation,
  useUnassignMutation,
  useGetSyncRunsQuery,
  useStartSyncMutation,
} = api;
