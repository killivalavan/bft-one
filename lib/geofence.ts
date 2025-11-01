export function metersBetween(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371000;
  const toRad = (d:number)=>d*Math.PI/180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function isWithinGeofence(lat:number, lng:number) {
  const centerLat = Number(process.env.NEXT_PUBLIC_GEOFENCE_LAT);
  const centerLng = Number(process.env.NEXT_PUBLIC_GEOFENCE_LNG);
  const radius = Number(process.env.NEXT_PUBLIC_GEOFENCE_RADIUS_METERS || 100);
  const d = metersBetween(lat, lng, centerLat, centerLng);
  return d <= radius;
}
