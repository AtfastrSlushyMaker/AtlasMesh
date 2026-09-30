import {
  mdiAirplane, mdiFerry, mdiSatelliteVariant, mdiStarFourPoints, mdiSpaceStation, mdiRocketLaunch,
  mdiPulse, mdiAlertOctagon, mdiBroadcast, mdiFire, mdiVolcano, mdiWeatherPartlyCloudy, mdiLifebuoy,
  mdiMeteor, mdiCctv, mdiCableData, mdiRouterNetwork, mdiAirport, mdiFactory, mdiWindTurbine,
} from '@mdi/js';
import type { EntityType } from '../../../shared/entity';

export type Category = 'live' | 'hazards' | 'space' | 'observation' | 'infrastructure' | 'history';

export interface LayerDef {
  id: EntityType;
  label: string;
  /** Singular noun for the inspector heading. */
  noun: string;
  color: string;
  icon: string;
  category: Category;
  defaultOn: boolean;
  description: string;
}

/**
 * Single source of truth for globe layers: sidebar, icons, inspector and
 * WebSocket subscriptions all read from here.
 */
export const LAYERS: LayerDef[] = [
  { id: 'aircraft', label: 'Aircraft', noun: 'Aircraft', color: '#5ab4e5', icon: mdiAirplane, category: 'live', defaultOn: true, description: 'ADS-B positions from OpenSky, extrapolated between updates.' },
  { id: 'ship', label: 'Ships', noun: 'Vessel', color: '#e3c25a', icon: mdiFerry, category: 'live', defaultOn: true, description: 'AIS position reports. Needs an AISStream key on the server.' },
  { id: 'iss', label: 'ISS', noun: 'Space station', color: '#8fe3e0', icon: mdiSpaceStation, category: 'space', defaultOn: true, description: 'International Space Station, updated every 5 seconds.' },
  { id: 'satellite', label: 'Satellites', noun: 'Satellite', color: '#a996e8', icon: mdiSatelliteVariant, category: 'space', defaultOn: true, description: 'Active satellites, propagated from Celestrak orbital elements.' },
  { id: 'starlink', label: 'Starlink', noun: 'Starlink satellite', color: '#c7a6f0', icon: mdiStarFourPoints, category: 'space', defaultOn: false, description: 'The Starlink constellation. Thousands of objects; heavy on slower devices.' },
  { id: 'launch', label: 'Upcoming launches', noun: 'Launch', color: '#6fd3a0', icon: mdiRocketLaunch, category: 'space', defaultOn: true, description: 'Next 30 orbital launches and their pads.' },
  { id: 'fireball', label: 'Fireballs', noun: 'Fireball', color: '#f08bb8', icon: mdiMeteor, category: 'space', defaultOn: false, description: 'Bright meteors detected by US government sensors (NASA CNEOS).' },
  { id: 'earthquake', label: 'Earthquakes', noun: 'Earthquake', color: '#ee6a5f', icon: mdiPulse, category: 'hazards', defaultOn: true, description: 'USGS earthquakes of the last 24 hours, sized by magnitude.' },
  { id: 'disaster', label: 'Disaster alerts', noun: 'Disaster alert', color: '#ff8a4c', icon: mdiAlertOctagon, category: 'hazards', defaultOn: true, description: 'GDACS alerts for cyclones, floods, droughts, quakes and volcanoes.' },
  { id: 'event', label: 'Natural events', noun: 'Natural event', color: '#f2a65a', icon: mdiBroadcast, category: 'hazards', defaultOn: true, description: 'NASA EONET: storms, sea ice, dust, landslides, fires. Storm tracks drawn.' },
  { id: 'wildfire', label: 'Fire hotspots', noun: 'Fire hotspot', color: '#e2553f', icon: mdiFire, category: 'hazards', defaultOn: true, description: 'Most intense VIIRS fire detections of the last 24 hours.' },
  { id: 'volcano', label: 'Volcanoes', noun: 'Volcano', color: '#d97a4a', icon: mdiVolcano, category: 'hazards', defaultOn: false, description: 'Holocene volcanoes from the Smithsonian catalogue.' },
  { id: 'weather', label: 'City weather', noun: 'Weather', color: '#7fb0e8', icon: mdiWeatherPartlyCloudy, category: 'observation', defaultOn: true, description: 'Current conditions in 60 cities (Open-Meteo).' },
  { id: 'buoy', label: 'Ocean buoys', noun: 'Buoy', color: '#56c2c9', icon: mdiLifebuoy, category: 'observation', defaultOn: false, description: 'Latest wind, wave and water readings from NOAA buoys.' },
  { id: 'camera', label: 'Public cameras', noun: 'Camera', color: '#e7e1a1', icon: mdiCctv, category: 'observation', defaultOn: true, description: 'Traffic and weather cameras published by TfL, Caltrans and Fintraffic.' },
  { id: 'cable', label: 'Subsea cables', noun: 'Cable', color: '#4fd1b0', icon: mdiCableData, category: 'infrastructure', defaultOn: true, description: 'Submarine telecom cables (TeleGeography).' },
  { id: 'ixp', label: 'Internet exchanges', noun: 'Internet exchange', color: '#8fa3f0', icon: mdiRouterNetwork, category: 'infrastructure', defaultOn: false, description: 'Internet exchange points from PeeringDB.' },
  { id: 'airport', label: 'Airports', noun: 'Airport', color: '#a9b3bd', icon: mdiAirport, category: 'infrastructure', defaultOn: false, description: 'Airports with IATA codes (OpenFlights).' },
  { id: 'powerplant', label: 'Power plants', noun: 'Power plant', color: '#e8c160', icon: mdiFactory, category: 'infrastructure', defaultOn: false, description: 'Largest 6,000 plants by capacity (WRI).' },
  { id: 'windfarm', label: 'Wind farms', noun: 'Wind farm', color: '#7fd49a', icon: mdiWindTurbine, category: 'infrastructure', defaultOn: false, description: 'Largest 4,000 wind farms by capacity (WRI).' },
  { id: 'meteorite', label: 'Meteorite landings', noun: 'Meteorite', color: '#d6a07a', icon: mdiMeteor, category: 'history', defaultOn: false, description: 'Heaviest 8,000 recorded meteorite finds and falls.' },
];

export const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l])) as Record<EntityType, LayerDef>;

export const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'live', label: 'Moving now' },
  { id: 'hazards', label: 'Hazards' },
  { id: 'space', label: 'Space' },
  { id: 'observation', label: 'Observation' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'history', label: 'Historical' },
];

export function defaultVisibility(): Record<string, boolean> {
  return Object.fromEntries(LAYERS.map((l) => [l.id, l.defaultOn]));
}
