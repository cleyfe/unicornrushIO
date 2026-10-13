/** Playable cities, built with `npm run build-city -- <id>`. */
export const CITIES = [
  { id: 'paris-opera', flag: '🇫🇷', name: 'Paris', area: 'Opéra & Monceau', blurb: 'From the Golden Triangle and Parc Monceau to Pigalle.' },
  { id: 'geneva', flag: '🇨🇭', name: 'Genève', area: 'Centre', blurb: 'Lakefront luxury, the Old Town, Pâquis and Plainpalais.' },
  { id: 'new-york', flag: '🇺🇸', name: 'New York', area: 'Lower Manhattan', blurb: 'Tribeca, SoHo and the West Village next to Chinatown and the Lower East Side.' },
  { id: 'london', flag: '🇬🇧', name: 'London', area: 'West End', blurb: 'Mayfair and Bond Street, Soho, Covent Garden and Holborn.' },
  { id: 'berlin', flag: '🇩🇪', name: 'Berlin', area: 'Mitte', blurb: 'Friedrichstraße and Hackescher Markt down to Kreuzberg.' },
  { id: 'san-francisco', flag: '🇺🇸', name: 'San Francisco', area: 'Downtown', blurb: 'Where unicorns are born: Nob Hill, the Financial District, SoMa and the Mission.' },
  { id: 'toronto', flag: '🇨🇦', name: 'Toronto', area: 'Downtown', blurb: 'Yorkville luxury, Kensington Market and the Financial District.' },
] as const;

export type CityId = (typeof CITIES)[number]['id'];
