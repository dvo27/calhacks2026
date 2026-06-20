import { create } from 'zustand';
import type { Activity, Stop, PlanStep } from './types';
import { EXAMPLE_STOPS } from './mockData';

interface TrekStore {
  // plan flow
  planStep: PlanStep;
  setPlanStep: (step: PlanStep) => void;

  // create step
  startLocation: string;
  setStartLocation: (v: string) => void;
  exploreArea: string;
  setExploreArea: (v: string) => void;
  exploreDate: string;
  setExploreDate: (v: string) => void;

  // activities step
  activities: Activity[];
  addActivity: (a: Activity) => void;
  removeActivity: (id: string) => void;
  clearActivities: () => void;

  // discover step
  curActIndex: number;
  setCurActIndex: (i: number) => void;

  // stops / route
  stops: Stop[];
  addStop: (s: Stop) => void;
  removeStop: (id: string) => void;
  moveStop: (id: string, dir: 'up' | 'down') => void;
  setStops: (stops: Stop[]) => void;
  clearStops: () => void;

  // social
  published: boolean;
  setPublished: (v: boolean) => void;

  // helpers
  loadExample: () => void;
  startNewDay: () => void;
}

export const useTrekStore = create<TrekStore>((set) => ({
  planStep: 'create',
  setPlanStep: (step) => set({ planStep: step }),

  startLocation: '',
  setStartLocation: (v) => set({ startLocation: v }),
  exploreArea: '',
  setExploreArea: (v) => set({ exploreArea: v }),
  exploreDate: '',
  setExploreDate: (v) => set({ exploreDate: v }),

  activities: [],
  addActivity: (a) => set((s) => ({ activities: [...s.activities, a] })),
  removeActivity: (id) => set((s) => ({ activities: s.activities.filter((a) => a.id !== id) })),
  clearActivities: () => set({ activities: [] }),

  curActIndex: 0,
  setCurActIndex: (i) => set({ curActIndex: i }),

  stops: [],
  addStop: (stop) => set((s) => ({ stops: [...s.stops, stop] })),
  removeStop: (id) => set((s) => ({ stops: s.stops.filter((st) => st.id !== id) })),
  moveStop: (id, dir) =>
    set((s) => {
      const idx = s.stops.findIndex((st) => st.id === id);
      if (idx < 0) return s;
      const arr = [...s.stops];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return s;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return { stops: arr };
    }),
  setStops: (stops) => set({ stops }),
  clearStops: () => set({ stops: [] }),

  published: false,
  setPublished: (v) => set({ published: v }),

  loadExample: () => set({ stops: EXAMPLE_STOPS.map((s) => ({ ...s })), planStep: 'plan' }),
  startNewDay: () =>
    set({
      planStep: 'create',
      startLocation: '',
      exploreArea: '',
      exploreDate: '',
      activities: [],
      curActIndex: 0,
      stops: [],
      published: false,
    }),
}));
