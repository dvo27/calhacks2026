import { create } from 'zustand';
import type { Activity, Stop, PlanStep } from './types';

interface TrekStore {
  // plan flow
  planStep: PlanStep;
  setPlanStep: (step: PlanStep) => void;

  // backend trip
  tripId: number | null;
  setTripId: (id: number | null) => void;

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
  startNewDay: () => void;
}

export const useTrekStore = create<TrekStore>((set) => ({
  planStep: 'discover',
  setPlanStep: (step) => set({ planStep: step }),

  tripId: null,
  setTripId: (id) => set({ tripId: id }),

  startLocation: '',
  setStartLocation: (v) => set({ startLocation: v }),
  exploreArea: '',
  setExploreArea: (v) => set({ exploreArea: v }),
  exploreDate: '',
  setExploreDate: (v) => set({ exploreDate: v }),

  activities: [],
  addActivity: (a: Activity) => set((s: TrekStore) => ({ activities: [...s.activities, a] })),
  removeActivity: (id: string) => set((s: TrekStore) => ({ activities: s.activities.filter((a) => a.id !== id) })),
  clearActivities: () => set({ activities: [] }),

  curActIndex: 0,
  setCurActIndex: (i) => set({ curActIndex: i }),

  stops: [],
  addStop: (stop: Stop) => set((s: TrekStore) => ({ stops: [...s.stops, stop] })),
  removeStop: (id: string) => set((s: TrekStore) => ({ stops: s.stops.filter((st) => st.id !== id) })),
  moveStop: (id: string, dir: 'up' | 'down') =>
    set((s: TrekStore) => {
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

  startNewDay: () =>
    set({
      planStep: 'discover',
      tripId: null,
      startLocation: '',
      exploreArea: '',
      exploreDate: '',
      activities: [],
      curActIndex: 0,
      stops: [],
      published: false,
    }),
}));