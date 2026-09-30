import { memo, useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import { mdiAirplane, mdiNavigation } from '@mdi/js';
import type { Entity } from '../../../shared/entity';
import { LAYER_BY_ID } from '../lib/layers';
import { ALERT_COLOR, DISASTER_ICON, EVENT_CATEGORY_ICON, dotIcon, glyphIcon, markerIcon } from '../lib/icons';
import { useLayer, LayerSpec } from './useLayer';

type Viewer = Cesium.Viewer;
interface Props {
  viewer: Viewer;
  visible: boolean;
}

const C = (hex: string) => Cesium.Color.fromCssColorString(hex);
const pos = (e: Entity, alt?: number) => Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, alt ?? e.position.alt ?? 0);
const SCALE_BY_DISTANCE = new Cesium.NearFarScalar(2e5, 1, 2.5e7, 0.45);
const NEAR = (m: number) => new Cesium.DistanceDisplayCondition(0, m);

function marker(ds: Cesium.CustomDataSource, e: Entity, image: string, opts: Partial<Cesium.BillboardGraphics.ConstructorOptions> = {}, extra: Partial<Cesium.Entity.ConstructorOptions> = {}) {
  return ds.entities.add({
    id: e.id,
    position: pos(e, 0),
    billboard: {
      image,
      scale: 0.55,
      scaleByDistance: SCALE_BY_DISTANCE,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      ...opts,
    },
    ...extra,
  });
}

/** Dead-reckoned position: Cesium interpolates between now and a projected point. */
function movingPosition(lat: number, lon: number, alt: number, speed: number | undefined, heading: number | undefined, horizonSec: number) {
  const now = Cesium.JulianDate.now();
  const p = new Cesium.SampledPositionProperty();
  p.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
  p.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
  p.addSample(now, Cesium.Cartesian3.fromDegrees(lon, lat, alt));
  if (speed && speed > 1 && heading != null) {
    const d = (speed * horizonSec) / 6371000;
    const h = Cesium.Math.toRadians(heading);
    const φ1 = Cesium.Math.toRadians(lat);
    const λ1 = Cesium.Math.toRadians(lon);
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(h));
    const λ2 = λ1 + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    p.addSample(Cesium.JulianDate.addSeconds(now, horizonSec, new Cesium.JulianDate()), Cesium.Cartesian3.fromRadians(λ2, φ2, alt));
  }
  return p;
}

// ---------------------------------------------------------------- vehicles

const aircraftIcon = () => glyphIcon(mdiAirplane, LAYER_BY_ID.aircraft.color, 28);
const aircraftGroundIcon = () => glyphIcon(mdiAirplane, '#8d96a0', 22);

export const AircraftLayer = memo(function AircraftLayer({ viewer, visible }: Props) {
  useLayer(viewer, visible, {
    type: 'aircraft',
    create: (e, ds) =>
      ds.entities.add({
        id: e.id,
        // Cap extrapolation at 3 minutes: long straight-line guesses drift on turns.
        position: movingPosition(e.position.lat, e.position.lon, e.position.alt ?? 0, e.velocity, e.heading, 180) as any,
        billboard: {
          image: e.metadata?.onGround ? aircraftGroundIcon() : aircraftIcon(),
          scale: 0.6,
          rotation: -Cesium.Math.toRadians(e.heading ?? 0),
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          scaleByDistance: new Cesium.NearFarScalar(1e5, 1.1, 1.5e7, 0.3),
        },
      }),
    update: (ent, e) => {
      ent.position = movingPosition(e.position.lat, e.position.lon, e.position.alt ?? 0, e.velocity, e.heading, 180) as any;
      if (ent.billboard) ent.billboard.rotation = new Cesium.ConstantProperty(-Cesium.Math.toRadians(e.heading ?? 0));
    },
  });
  return null;
});

export const ShipLayer = memo(function ShipLayer({ viewer, visible }: Props) {
  const icon = glyphIcon(mdiNavigation, LAYER_BY_ID.ship.color, 22);
  useLayer(viewer, visible, {
    type: 'ship',
    create: (e, ds) =>
      ds.entities.add({
        id: e.id,
        position: movingPosition(e.position.lat, e.position.lon, 0, e.velocity, e.heading, 600) as any,
        billboard: { image: icon, scale: 0.55, rotation: -Cesium.Math.toRadians(e.heading ?? 0), alignedAxis: Cesium.Cartesian3.UNIT_Z, scaleByDistance: SCALE_BY_DISTANCE },
      }),
    update: (ent, e) => {
      ent.position = movingPosition(e.position.lat, e.position.lon, 0, e.velocity, e.heading, 600) as any;
      if (ent.billboard) ent.billboard.rotation = new Cesium.ConstantProperty(-Cesium.Math.toRadians(e.heading ?? 0));
    },
  });
  return null;
});

// ---------------------------------------------------------------- orbits

const SAMPLE_STEP = 60; // seconds
const SAMPLE_SPAN = 20 * 60; // seconds ahead

function geodetic(satrec: any, date: Date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
  const gd = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, satellite.gstime(date));
  const alt = gd.height * 1000;
  if (!Number.isFinite(alt) || alt < 0) return null;
  return Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, alt);
}

/**
 * Satellites are sampled once a minute for the next 20 minutes and Cesium
 * interpolates in between, so nothing runs per frame. Sampling is spread
 * over animation frames to keep the UI responsive with ~10k objects.
 */
function useOrbitLayer(viewer: Viewer, visible: boolean, type: 'satellite' | 'starlink') {
  const satrecs = useRef(new Map<string, any>());
  const props = useRef(new Map<string, Cesium.SampledPositionProperty>());
  const pending = useRef<string[]>([]);
  const color = LAYER_BY_ID[type].color;
  const image = type === 'starlink' ? dotIcon(color, 8) : markerIcon(LAYER_BY_ID.satellite.icon, color, 32);

  const fill = (id: string) => {
    const satrec = satrecs.current.get(id);
    const p = props.current.get(id);
    if (!satrec || !p) return;
    const start = Cesium.JulianDate.addSeconds(Cesium.JulianDate.now(), -SAMPLE_STEP, new Cesium.JulianDate());
    for (let t = 0; t <= SAMPLE_SPAN + SAMPLE_STEP; t += SAMPLE_STEP) {
      const jd = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
      const c = geodetic(satrec, Cesium.JulianDate.toDate(jd));
      if (c) p.addSample(jd, c);
    }
  };

  const { dataSource } = useLayer(viewer, visible, {
    type,
    create: (e, ds) => {
      if (!e.metadata?.tle1 || !e.metadata?.tle2) return null;
      let satrec: any;
      try {
        satrec = satellite.twoline2satrec(e.metadata.tle1, e.metadata.tle2);
      } catch {
        return null;
      }
      const p = new Cesium.SampledPositionProperty();
      p.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
      p.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
      const now = geodetic(satrec, new Date());
      if (!now) return null; // decayed or bad elements
      p.addSample(Cesium.JulianDate.now(), now);
      satrecs.current.set(e.id, satrec);
      props.current.set(e.id, p);
      pending.current.push(e.id);
      return ds.entities.add({
        id: e.id,
        position: p as any,
        billboard: { image, scale: type === 'starlink' ? 0.7 : 0.5, scaleByDistance: new Cesium.NearFarScalar(5e5, 1, 3e7, 0.5) },
      });
    },
    onRemove: (id) => {
      satrecs.current.delete(id);
      props.current.delete(id);
    },
  });

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let stopped = false;
    const work = () => {
      if (stopped) return;
      const t0 = performance.now();
      while (pending.current.length && performance.now() - t0 < 8) fill(pending.current.pop()!);
      if (pending.current.length) viewer.scene.requestRender();
      raf = requestAnimationFrame(work);
    };
    raf = requestAnimationFrame(work);
    // Refill every 15 minutes, before the sampled window runs out.
    const refill = setInterval(() => {
      for (const id of props.current.keys()) {
        const fresh = new Cesium.SampledPositionProperty();
        fresh.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
        fresh.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
        props.current.set(id, fresh);
        const ent = dataSource.current?.entities.getById(id);
        const c = geodetic(satrecs.current.get(id), new Date());
        if (c) fresh.addSample(Cesium.JulianDate.now(), c);
        if (ent) ent.position = fresh as any;
        pending.current.push(id);
      }
    }, 15 * 60 * 1000);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(refill);
    };
  }, [visible, viewer]);
}

export const SatelliteLayer = memo(function SatelliteLayer({ viewer, visible }: Props) {
  useOrbitLayer(viewer, visible, 'satellite');
  return null;
});

export const StarlinkLayer = memo(function StarlinkLayer({ viewer, visible }: Props) {
  useOrbitLayer(viewer, visible, 'starlink');
  return null;
});

export const ISSLayer = memo(function ISSLayer({ viewer, visible }: Props) {
  const prop = useRef<Cesium.SampledPositionProperty | null>(null);
  const trail = useRef<Cesium.Cartesian3[]>([]);
  const color = C(LAYER_BY_ID.iss.color);
  useLayer(viewer, visible, {
    type: 'iss',
    create: (e, ds) => {
      const p = new Cesium.SampledPositionProperty();
      p.forwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;
      p.forwardExtrapolationDuration = 15;
      p.addSample(Cesium.JulianDate.now(), pos(e));
      prop.current = p;
      trail.current = [pos(e)];
      const footprintKm = Number(e.metadata?.footprint) || 4500;
      ds.entities.add({
        id: `${e.id}:trail`,
        polyline: {
          positions: new Cesium.CallbackProperty(() => trail.current, false) as any,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({ color: color.withAlpha(0.7), dashLength: 12 }),
        },
      });
      return ds.entities.add({
        id: e.id,
        position: p as any,
        billboard: { image: markerIcon(LAYER_BY_ID.iss.icon, LAYER_BY_ID.iss.color, 44), scale: 0.8 },
        label: {
          text: 'ISS',
          font: '600 13px Barlow, sans-serif',
          fillColor: C('#e6e1d3'),
          showBackground: true,
          backgroundColor: C('#0e1822').withAlpha(0.8),
          pixelOffset: new Cesium.Cartesian2(0, -26),
          distanceDisplayCondition: NEAR(3e7),
        },
        ellipse: {
          semiMajorAxis: (footprintKm / 2) * 1000,
          semiMinorAxis: (footprintKm / 2) * 1000,
          material: color.withAlpha(0.06),
          outline: true,
          outlineColor: color.withAlpha(0.35),
          height: 0,
        },
      });
    },
    update: (ent, e) => {
      const c = pos(e);
      const now = Cesium.JulianDate.now();
      prop.current?.addSample(now, c);
      // Drop samples older than two minutes so the property doesn't grow all day.
      prop.current?.removeSamples(new Cesium.TimeInterval({ start: Cesium.JulianDate.fromIso8601('2000-01-01'), stop: Cesium.JulianDate.addSeconds(now, -120, new Cesium.JulianDate()) }));
      trail.current = [...trail.current.slice(-180), c];
      void ent;
    },
    onRemove: (id, ds) => {
      const t = ds.entities.getById(`${id}:trail`);
      if (t) ds.entities.remove(t);
    },
  });
  return null;
});

// ---------------------------------------------------------------- hazards

export const EarthquakeLayer = memo(function EarthquakeLayer({ viewer, visible }: Props) {
  useLayer(viewer, visible, {
    type: 'earthquake',
    create: (e, ds) => {
      const mag = Number(e.metadata?.mag) || 0;
      const ageH = (Date.now() - e.timestamp) / 3600000;
      const color = ageH < 1 ? C('#ff5a4e') : ageH < 6 ? C('#ee6a5f') : C('#c96a62');
      return ds.entities.add({
        id: e.id,
        position: pos(e, 0),
        point: {
          pixelSize: Math.max(5, 3 + mag * 2.6),
          color: color.withAlpha(ageH < 6 ? 0.85 : 0.6),
          outlineColor: C('#09121a').withAlpha(0.9),
          outlineWidth: 1.5,
          scaleByDistance: new Cesium.NearFarScalar(3e5, 1.4, 2e7, 0.8),
        },
        label: mag >= 4.5 ? {
          text: `M${mag.toFixed(1)}`,
          font: '600 12px Barlow, sans-serif',
          fillColor: C('#e6e1d3'),
          showBackground: true,
          backgroundColor: C('#0e1822').withAlpha(0.75),
          backgroundPadding: new Cesium.Cartesian2(4, 2),
          pixelOffset: new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: NEAR(9e6),
        } : undefined,
      });
    },
  });
  return null;
});

export const DisasterLayer = memo(function DisasterLayer({ viewer, visible }: Props) {
  useLayer(viewer, visible, {
    type: 'disaster',
    create: (e, ds) =>
      marker(ds, e, markerIcon(DISASTER_ICON[e.metadata?.hazardCode] || LAYER_BY_ID.disaster.icon, ALERT_COLOR[e.metadata?.alertLevel] || LAYER_BY_ID.disaster.color, 40, 'diamond'), { scale: e.metadata?.alertLevel === 'Red' ? 0.8 : 0.62 }),
  });
  return null;
});

export const EventLayer = memo(function EventLayer({ viewer, visible }: Props) {
  const color = LAYER_BY_ID.event.color;
  useLayer(viewer, visible, {
    type: 'event',
    create: (e, ds) => {
      const icon = markerIcon(EVENT_CATEGORY_ICON[e.metadata?.category] || LAYER_BY_ID.event.icon, color, 36);
      const path = e.metadata?.path as Array<{ lat: number; lon: number }> | undefined;
      if (path && path.length > 1) {
        ds.entities.add({
          id: `${e.id}:track`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(path.flatMap((p) => [p.lon, p.lat])),
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({ color: C(color).withAlpha(0.8), dashLength: 10 }),
          },
        });
      }
      return marker(ds, e, icon, { scale: 0.55 });
    },
    onRemove: (id, ds) => {
      const t = ds.entities.getById(`${id}:track`);
      if (t) ds.entities.remove(t);
    },
  });
  return null;
});

export const WildfireLayer = memo(function WildfireLayer({ viewer, visible }: Props) {
  const hot = dotIcon('#ff6a3d', 10);
  const warm = dotIcon('#e2553f', 8);
  useLayer(viewer, visible, {
    type: 'wildfire',
    create: (e, ds) => {
      const frp = Number(e.metadata?.frpMw) || 0;
      return marker(ds, e, frp > 100 ? hot : warm, { scale: Math.min(1.1, 0.6 + frp / 600), scaleByDistance: new Cesium.NearFarScalar(2e5, 1.3, 2e7, 0.5) });
    },
  });
  return null;
});

// ---------------------------------------------------------------- generic point layers

function simpleLayer(type: keyof typeof LAYER_BY_ID, opts: { cluster?: boolean; scale?: number; near?: number; dot?: number; label?: (e: Entity) => string | undefined } = {}) {
  return memo(function SimpleLayer({ viewer, visible }: Props) {
    const l = LAYER_BY_ID[type];
    const image = opts.dot ? dotIcon(l.color, opts.dot) : markerIcon(l.icon, l.color, 36);
    const spec: LayerSpec = {
      type,
      cluster: opts.cluster ? { pixelRange: 36, minimumClusterSize: 4, icon: markerIcon(l.icon, l.color, 44) } : undefined,
      create: (e, ds) => {
        const text = opts.label?.(e);
        return marker(
          ds,
          e,
          image,
          { scale: opts.scale ?? 0.5, distanceDisplayCondition: opts.near ? NEAR(opts.near) : undefined },
          text
            ? {
                label: {
                  text,
                  font: '600 12px Barlow, sans-serif',
                  fillColor: C('#e6e1d3'),
                  showBackground: true,
                  backgroundColor: C('#0e1822').withAlpha(0.78),
                  backgroundPadding: new Cesium.Cartesian2(4, 2),
                  pixelOffset: new Cesium.Cartesian2(14, 0),
                  horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                  distanceDisplayCondition: NEAR(1.2e7),
                },
              }
            : {}
        );
      },
    };
    useLayer(viewer, visible, spec);
    return null;
  });
}

export const WeatherLayer = simpleLayer('weather', { label: (e) => (e.metadata?.temperatureC != null ? `${Math.round(e.metadata.temperatureC)}°` : undefined) });
export const BuoyLayer = simpleLayer('buoy', { dot: 10, scale: 0.8 });
export const CameraLayer = simpleLayer('camera', { cluster: true, scale: 0.5 });
export const VolcanoLayer = simpleLayer('volcano', { cluster: true, scale: 0.5 });
export const LaunchLayer = simpleLayer('launch', { scale: 0.6 });
export const FireballLayer = simpleLayer('fireball', { scale: 0.5 });
export const IXPLayer = simpleLayer('ixp', { cluster: true });
export const AirportLayer = simpleLayer('airport', { cluster: true, scale: 0.45 });
export const PowerPlantLayer = simpleLayer('powerplant', { cluster: true, scale: 0.45 });
export const WindFarmLayer = simpleLayer('windfarm', { cluster: true, scale: 0.45 });
export const MeteoriteLayer = simpleLayer('meteorite', { cluster: true, scale: 0.45 });

export const CableLayer = memo(function CableLayer({ viewer, visible }: Props) {
  const line = (points: Array<{ lat: number; lon: number }>, color: Cesium.Color) => ({
    positions: Cesium.Cartesian3.fromDegreesArrayHeights(points.flatMap((p) => [p.lon, p.lat, 800])),
    width: 1.3,
    arcType: Cesium.ArcType.GEODESIC,
    material: color,
  });
  useLayer(viewer, visible, {
    type: 'cable',
    create: (e, ds) => {
      const segments = (e.metadata?.segments as Array<Array<{ lat: number; lon: number }>> | undefined)?.filter((s) => s.length > 1);
      if (!segments?.length) return null;
      // One calm colour: per-cable rainbow colours overwhelm everything else at global zoom.
      const color = C(LAYER_BY_ID.cable.color).withAlpha(0.32);
      // Extra segments are child entities so picking any of them selects the cable.
      segments.slice(1).forEach((seg, i) => ds.entities.add({ id: `${e.id}:seg${i}`, polyline: line(seg, color) }));
      return ds.entities.add({ id: e.id, position: pos(e, 0), polyline: line(segments[0], color) });
    },
    onRemove: (id, ds) => {
      for (let i = 0; ; i++) {
        const seg = ds.entities.getById(`${id}:seg${i}`);
        if (!seg) break;
        ds.entities.remove(seg);
      }
    },
  });
  return null;
});

export const LAYER_COMPONENTS: Record<string, React.ComponentType<Props>> = {
  aircraft: AircraftLayer,
  ship: ShipLayer,
  satellite: SatelliteLayer,
  starlink: StarlinkLayer,
  iss: ISSLayer,
  launch: LaunchLayer,
  fireball: FireballLayer,
  earthquake: EarthquakeLayer,
  disaster: DisasterLayer,
  event: EventLayer,
  wildfire: WildfireLayer,
  volcano: VolcanoLayer,
  weather: WeatherLayer,
  buoy: BuoyLayer,
  camera: CameraLayer,
  cable: CableLayer,
  ixp: IXPLayer,
  airport: AirportLayer,
  powerplant: PowerPlantLayer,
  windfarm: WindFarmLayer,
  meteorite: MeteoriteLayer,
};
