import React from 'react';
import { AircraftLayer } from './AircraftLayer';
import { ShipLayer } from './ShipLayer';
import { SatelliteLayer } from './SatelliteLayer';
import { EarthquakeLayer } from './EarthquakeLayer';
import { EventLayer } from './EventLayer';
import { WeatherLayer } from './WeatherLayer';
import { LaunchLayer } from './LaunchLayer';
import { WildfireLayer } from './WildfireLayer';
import { VolcanoLayer } from './VolcanoLayer';
import { CableLayer } from './CableLayer';

interface LayerManagerProps {
  viewer: any;
  visibility: Record<string, boolean>;
}

export function LayerManager({ viewer, visibility }: LayerManagerProps) {
  if (!viewer) return null;

  return (
    <>
      <AircraftLayer viewer={viewer} visible={visibility.aircraft ?? true} />
      <ShipLayer viewer={viewer} visible={visibility.ship ?? true} />
      <SatelliteLayer viewer={viewer} visible={visibility.satellite ?? true} />
      <EarthquakeLayer viewer={viewer} visible={visibility.earthquake ?? true} />
      <EventLayer viewer={viewer} visible={visibility.event ?? true} />
      <WeatherLayer viewer={viewer} visible={visibility.weather ?? true} />
      <LaunchLayer viewer={viewer} visible={visibility.launch ?? true} />
      <WildfireLayer viewer={viewer} visible={visibility.wildfire ?? true} />
      <VolcanoLayer viewer={viewer} visible={visibility.volcano ?? true} />
      <CableLayer viewer={viewer} visible={visibility.cable ?? true} />
    </>
  );
}
