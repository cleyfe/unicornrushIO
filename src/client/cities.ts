/** Playable cities, built with `npm run build-city -- <id>`. */
export const CITIES = [
  { id: 'paris-opera', flag: '🇫🇷', name: 'Paris', area: 'Opéra & Monceau', blurb: 'From the Golden Triangle and Parc Monceau to Pigalle.' },
  { id: 'geneva', flag: '🇨🇭', name: 'Genève', area: 'Centre', blurb: 'Lakefront luxury, the Old Town, Pâquis and Plainpalais.' },
] as const;

export type CityId = (typeof CITIES)[number]['id'];
