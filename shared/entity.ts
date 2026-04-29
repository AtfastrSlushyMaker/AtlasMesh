export type EntityType =
  | 'aircraft'
  | 'ship'
  | 'satellite'
  | 'debris'
  | 'launch'
  | 'event'
  | 'earthquake'
  | 'weather'
  | 'lightning'
  | 'wildfire'
  | 'cable'
  | 'volcano';

export interface Entity {
  id: string;
  type: EntityType;
  position: {
    lat: number;
    lon: number;
    alt?: number;
  };
  velocity?: number;
  heading?: number;
  timestamp: number;
  metadata: Record<string, any>;
}
