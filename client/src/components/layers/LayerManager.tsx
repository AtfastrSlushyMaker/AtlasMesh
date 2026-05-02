import React, { memo } from 'react';
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
import { PowerPlantLayer } from './PowerPlantLayer';
import { MeteoriteLayer } from './MeteoriteLayer';
import { WindFarmLayer } from './WindFarmLayer';
import { IXPLayer } from './IXPLayer';
import { StarlinkLayer } from './StarlinkLayer';
import { ISSLayer } from './ISSLayer';
import { AirportLayer } from './AirportLayer';

interface LayerManagerProps {
  viewer: any;
  visibility: Record<string, boolean>;
}

export const LayerManager = memo(function LayerManager({ viewer, visibility }: LayerManagerProps) {
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
      <PowerPlantLayer viewer={viewer} visible={visibility.powerplant ?? true} />
      <MeteoriteLayer viewer={viewer} visible={visibility.meteorite ?? true} />
      <WindFarmLayer viewer={viewer} visible={visibility.windfarm ?? true} />
      <IXPLayer viewer={viewer} visible={visibility.ixp ?? true} />
      <StarlinkLayer viewer={viewer} visible={visibility.starlink ?? true} />
      <ISSLayer viewer={viewer} visible={visibility.iss ?? true} />
      <AirportLayer viewer={viewer} visible={visibility.airport ?? true} />
    </>
  );
});
