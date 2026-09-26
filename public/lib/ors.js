// OpenRouteService GeoJSON → the simple route objects the app works with. Pure module.
//
// route = { id, index, duration (s), distance (m), geometry: [[lon,lat],...],
//           steps: [{ instruction, type, name, distance, duration, from, to }] }
// `from`/`to` are indexes into geometry (ORS "way_points").
// ORS step types: 0 left, 1 right, 2 sharp left, 3 sharp right, 4 slight left, 5 slight right,
//                 6 straight, 7 enter roundabout, 8 exit roundabout, 9 u-turn, 10 goal, 11 depart,
//                 12 keep left, 13 keep right

export function normalizeOrsRoutes(geojson) {
  const features = geojson?.features;
  if (!Array.isArray(features)) return [];
  return features.map((f, i) => {
    const p = f.properties || {};
    const steps = [];
    for (const seg of p.segments || []) {
      for (const s of seg.steps || []) {
        steps.push({
          instruction: s.instruction || '',
          type: s.type,
          name: s.name && s.name !== '-' ? s.name : '',
          distance: s.distance || 0,
          duration: s.duration || 0,
          from: s.way_points?.[0] ?? 0,
          to: s.way_points?.[1] ?? 0,
        });
      }
    }
    return {
      id: 'r' + (i + 1),
      index: i,
      duration: p.summary?.duration ?? 0,
      distance: p.summary?.distance ?? 0,
      geometry: f.geometry?.coordinates || [],
      steps,
    };
  });
}
