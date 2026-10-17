import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import SortIcon from '@mui/icons-material/Sort';
import {
  Badge,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { POSITION_SORTS, SKILLS, formatDay, type PositionSort, type Skill } from '@crew-board/shared';
import { useId, useState, type RefObject } from 'react';
import type { BoardFilters } from '../../shared/api.ts';
import { skillLabel } from '../../shared/skills.ts';
import { tint } from '../../theme/brand.ts';
import { SORT_LABELS, activeFilterCount, type Tab as TabName } from './boardParams.ts';

interface Props {
  tab: TabName;
  onTab: (tab: TabName) => void;
  counts: { open: number | undefined; filled: number | undefined };
  search: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onSearch: (text: string) => void;
  sort: PositionSort;
  onSort: (sort: PositionSort) => void;
  filters: BoardFilters;
  onFilters: (next: BoardFilters) => void;
}

function SortMenu({ sort, onSort }: { sort: PositionSort; onSort: (s: PositionSort) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const buttonId = useId();
  return (
    <>
      <Button
        id={buttonId}
        color="inherit"
        startIcon={<SortIcon />}
        endIcon={<ExpandMoreIcon />}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ border: 1, borderColor: 'divider', color: 'text.primary' }}
      >
        Sort: {SORT_LABELS[sort]}
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { 'aria-labelledby': buttonId } }}
      >
        {POSITION_SORTS.map((key) => (
          <MenuItem
            key={key}
            role="menuitemradio"
            aria-checked={key === sort}
            selected={key === sort}
            onClick={() => {
              onSort(key);
              setAnchor(null);
            }}
          >
            <ListItemIcon>{key === sort ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            {SORT_LABELS[key]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

const fieldSx = { '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } } as const;

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const STAFFING_LABEL = { none: 'No one assigned yet', some: 'Someone assigned' } as const;
const WITHIN_OPTIONS = [7, 14, 30] as const;

function CommitField({ label, value, onCommit }: { label: string; value: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <TextField
      size="small"
      label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (draft.trim() !== value) onCommit(draft.trim());
        }
      }}
      placeholder="For example Priya"
      autoComplete="off"
      slotProps={{ inputLabel: { shrink: true } }}
      sx={fieldSx}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack spacing={1}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}
      >
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

function FilterButton({ filters, onFilters }: { filters: BoardFilters; onFilters: (f: BoardFilters) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const count = activeFilterCount(filters);
  const rangeInvalid = Boolean(filters.from && filters.to && filters.to < filters.from);
  const set = (patch: { [K in keyof BoardFilters]?: BoardFilters[K] | '' | null }) => {
    const next: Record<string, unknown> = { ...filters, ...patch };
    for (const key of Object.keys(next))
      if (next[key] === '' || next[key] === null || next[key] === undefined || next[key] === false) delete next[key];
    onFilters(next);
  };

  return (
    <>
      <Badge badgeContent={count} color="primary" invisible={count === 0}>
        <Button
          color="inherit"
          startIcon={<FilterListIcon />}
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchor)}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ border: 1, borderColor: count ? 'primary.main' : 'divider', color: 'text.primary' }}
        >
          Filters
        </Button>
      </Badge>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': 'Filter positions',
            sx: { width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 120px)', p: 2.5, mt: 1 },
          },
        }}
      >
        <Stack spacing={2.25}>
          <Typography component="h3" variant="h3">
            Filter positions
          </Typography>

          <Section title="What">
            <TextField
              select
              size="small"
              label="Skill"
              value={filters.skill ?? ''}
              onChange={(e) => set({ skill: (e.target.value || undefined) as Skill | undefined })}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              sx={fieldSx}
            >
              <option value="">All skills</option>
              {SKILLS.map((sk) => (
                <option key={sk} value={sk}>
                  {skillLabel(sk)}
                </option>
              ))}
            </TextField>
          </Section>

          <Section title="When">
            <Stack direction="row" spacing={1.5}>
              <TextField
                size="small"
                type="date"
                label="Running from"
                value={filters.from ?? ''}
                onChange={(e) => set({ from: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ ...fieldSx, flex: 1 }}
              />
              <TextField
                size="small"
                type="date"
                label="Running until"
                value={filters.to ?? ''}
                onChange={(e) => set({ to: e.target.value })}
                error={rangeInvalid}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ ...fieldSx, flex: 1 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Shows positions that run at any time in this period.
            </Typography>
            {rangeInvalid ? (
              <Typography role="alert" variant="body2" color="error" sx={{ fontWeight: 600 }}>
                The end date is before the start date, so nothing can match.
              </Typography>
            ) : null}
            <Typography variant="body2" id="within-label" sx={{ fontWeight: 600 }}>
              Starts within
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              aria-labelledby="within-label"
              value={filters.startsWithin ?? 0}
              onChange={(_e, v: number | null) => v !== null && set({ startsWithin: v === 0 ? undefined : v })}
            >
              <ToggleButton value={0} aria-label="Any start date">
                Any
              </ToggleButton>
              {WITHIN_OPTIONS.map((d) => (
                <ToggleButton key={d} value={d} aria-label={`Starts within ${d} days`}>
                  {d} days
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Section>

          <Section title="Who">
            <CommitField
              key={filters.assignee ?? ''}
              label="Assigned to"
              value={filters.assignee ?? ''}
              onCommit={(text) => set({ assignee: text })}
            />
            <Stack direction="row" spacing={1.5}>
              <TextField
                select
                size="small"
                label="Staffing"
                value={filters.staffing ?? ''}
                onChange={(e) => set({ staffing: (e.target.value || undefined) as BoardFilters['staffing'] })}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                sx={{ ...fieldSx, flex: 1 }}
              >
                <option value="">Any</option>
                <option value="none">{STAFFING_LABEL.none}</option>
                <option value="some">{STAFFING_LABEL.some}</option>
              </TextField>
              <TextField
                select
                size="small"
                label="Seats still open"
                value={String(filters.minSeats ?? '')}
                onChange={(e) => set({ minSeats: e.target.value ? Number(e.target.value) : undefined })}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                sx={{ ...fieldSx, flex: 1 }}
              >
                <option value="">Any</option>
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} or more
                  </option>
                ))}
              </TextField>
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={Boolean(filters.needsReplacement)}
                  onChange={(e) => set({ needsReplacement: e.target.checked || undefined })}
                />
              }
              label={<Typography variant="body2">Needs a replacement (someone was deactivated by HR)</Typography>}
            />
          </Section>

          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
            <Button disabled={count === 0} onClick={() => onFilters({})}>
              Clear all
            </Button>
            <Button variant="contained" onClick={() => setAnchor(null)}>
              Done
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}

export function ActiveFilters({ filters, onFilters }: { filters: BoardFilters; onFilters: (f: BoardFilters) => void }) {
  const items: { key: keyof BoardFilters; label: string }[] = [];
  if (filters.skill) items.push({ key: 'skill', label: `Skill: ${sentence(skillLabel(filters.skill))}` });
  if (filters.from) items.push({ key: 'from', label: `Running from ${formatDay(filters.from)}` });
  if (filters.to) items.push({ key: 'to', label: `Running until ${formatDay(filters.to)}` });
  if (filters.startsWithin) items.push({ key: 'startsWithin', label: `Starts within ${filters.startsWithin} days` });
  if (filters.assignee) items.push({ key: 'assignee', label: `Assigned to “${filters.assignee}”` });
  if (filters.staffing) items.push({ key: 'staffing', label: STAFFING_LABEL[filters.staffing] });
  if (filters.minSeats) items.push({ key: 'minSeats', label: `${filters.minSeats}+ seats open` });
  if (filters.needsReplacement) items.push({ key: 'needsReplacement', label: 'Needs a replacement' });
  if (items.length === 0) return null;
  const remove = (key: keyof BoardFilters) => {
    const next = { ...filters };
    delete next[key];
    onFilters(next);
  };
  return (
    <Stack
      component="ul"
      aria-label="Active filters"
      direction="row"
      useFlexGap
      sx={{ listStyle: 'none', m: 0, p: 0, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
    >
      {items.map((item) => (
        <li key={item.key}>
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              alignItems: 'center',
              pl: 1.25,
              pr: 0.25,
              py: 0.25,
              borderRadius: 99,
              bgcolor: tint('primary', 0.1),
              border: 1,
              borderColor: tint('primary', 0.35),
              color: 'primary.main',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 650 }}>
              {item.label}
            </Typography>
            <IconButton
              size="small"
              aria-label={`Remove filter: ${item.label}`}
              onClick={() => remove(item.key)}
              sx={{ p: 0.4, color: 'inherit' }}
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </li>
      ))}
      <li>
        <Button size="small" onClick={() => onFilters({})}>
          Clear all
        </Button>
      </li>
    </Stack>
  );
}

export function BoardToolbar({
  tab,
  onTab,
  counts,
  search,
  searchRef,
  onSearch,
  sort,
  onSort,
  filters,
  onFilters,
}: Props) {
  return (
    <Paper variant="outlined" sx={{ flex: 'none', px: { xs: 1, md: 1.5 }, py: 0.5 }}>
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={1}
        sx={{ alignItems: { lg: 'center' }, justifyContent: 'space-between' }}
      >
        <Tabs
          value={tab}
          onChange={(_e, v: TabName) => onTab(v)}
          selectionFollowsFocus
          aria-label="Position status"
          sx={{ minHeight: 48 }}
        >
          <Tab
            id="tab-open"
            value="open"
            aria-controls="panel-open"
            label={counts.open === undefined ? 'Open' : `Open (${counts.open})`}
          />
          <Tab
            id="tab-filled"
            value="filled"
            aria-controls="panel-filled"
            label={counts.filled === undefined ? 'Filled' : `Filled (${counts.filled})`}
          />
        </Tabs>
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', pb: { xs: 1, lg: 0 } }}>
          <TextField
            size="small"
            type="search"
            inputRef={searchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search project or skill (press /)"
            autoComplete="off"
            slotProps={{
              htmlInput: { 'aria-label': 'Search positions by project or skill', 'aria-keyshortcuts': '/' },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: { xs: '100%', sm: 260 }, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
          />
          <Box sx={{ display: 'contents' }}>
            <SortMenu sort={sort} onSort={onSort} />
            <FilterButton filters={filters} onFilters={onFilters} />
          </Box>
        </Stack>
      </Stack>
    </Paper>
  );
}
