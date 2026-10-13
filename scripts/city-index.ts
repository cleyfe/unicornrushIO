// Rewrites public/cities/index.json and the thumbnails, after adding or rebuilding cities
// (build-city does this too):
//
//   npm run city-index
import { writeCityIndex } from './cityIndex';

for (const c of writeCityIndex()) console.log(`${c.flag} ${c.city} · ${c.area}: ${c.streets} streets`);
