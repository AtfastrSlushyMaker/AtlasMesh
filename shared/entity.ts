export type EntityType =
  | 'aircraft'
  | 'ship'
  | 'satellite'
  | 'debris'
  | 'launch'
  | 'event'
  | 'earthquake'
  | 'weather'
  | 'wildfire'
  | 'cable'
  | 'volcano'
  | 'fireball'
  | 'powerplant'
  | 'meteorite'
  | 'windfarm'
  | 'ixp'
  | 'starlink'
  | 'iss'
  | 'airport';

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
