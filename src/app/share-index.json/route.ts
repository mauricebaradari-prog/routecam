import { ROUTES } from '@/data/routes';
import { FOUNDER } from '@/lib/channels';
import { haversineDistance } from '@/lib/geo';

// Static JSON written to out/share-index.json at build time. public/r.php reads it to give
// every shared ride its own link preview (title + video thumbnail) on WhatsApp, Facebook & co.
// Rides created by users are not in here – r.php looks those up in Supabase once it exists.
export const dynamic = 'force-static';

export async function GET() {
  const rides = ROUTES.map(r => {
    let km = 0;
    for (let i = 1; i < r.cities.length; i++) km += haversineDistance(r.cities[i - 1], r.cities[i]);
    return {
      id: r.id,
      title: r.name,
      videoId: r.videoId,
      km: Math.round(km),
      minutes: Math.round(r.durationSeconds / 60),
      start: r.cities[0]?.name ?? '',
      end: r.cities[r.cities.length - 1]?.name ?? '',
      ownerId: FOUNDER.id,
    };
  });
  return Response.json({
    rides,
    channels: { [FOUNDER.id]: { name: FOUNDER.name, rides: rides.length, km: rides.reduce((s, r) => s + r.km, 0) } },
  });
}
