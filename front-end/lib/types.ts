export type StopCat = 'food' | 'shopping' | 'nightlife' | 'attractions';

export type PlanStep = 'location' | 'acts' | 'discover' | 'plan';

export interface Activity {
  id: string;
  label: string;
  kind: StopCat;
}

export interface Stop {
  id: string;
  name: string;
  address: string;
  cat: StopCat;
  price: number;    // dollars
  dur: number;      // minutes
  lat?: number;
  lng?: number;
}

export interface Candidate {
  id: string;
  name: string;
  address: string;
  cat: StopCat;
  price: number;
  dur: number;
  rating: number;
  reviewCount: number;
  tags: string[];
}

export interface Post {
  id: string;
  author: string;
  authorInitial: string;
  authorColor?: string;
  title: string;
  mapKey: string;
  drive: string;
  budget: string;
  gas: string;
  miles: string;
  tags: string[];
  stops: { name: string; address: string }[];
  likes: number;
  comments: number;
  saves: number;
}

export interface BusinessResult {
  id: string;
  name: string;
  address: string;
  cat: StopCat;
  price: number;
  rating: number;
}
