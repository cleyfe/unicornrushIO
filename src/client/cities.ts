/** Playable cities, built with `npm run build-city -- <id>`. */
export const CITIES = [
  { id: 'paris-opera', flag: '🇫🇷', name: 'Paris', area: 'Opéra & Monceau', blurb: 'From the Golden Triangle and Parc Monceau to Pigalle.' },
  { id: 'geneva', flag: '🇨🇭', name: 'Genève', area: 'Centre', blurb: 'Rich city: a quarter of the streets are luxury, so premium prices pay. Lakefront, Old Town, Pâquis, Plainpalais.' },
  { id: 'new-york', flag: '🇺🇸', name: 'New York', area: 'Lower Manhattan', blurb: 'Tribeca, SoHo and the West Village next to Chinatown and the Lower East Side.' },
  { id: 'london', flag: '🇬🇧', name: 'London', area: 'West End', blurb: 'Mayfair and Bond Street, Soho, Covent Garden and Holborn.' },
  { id: 'berlin', flag: '🇩🇪', name: 'Berlin', area: 'Mitte', blurb: 'Budget city: nearly half the streets are modest, so low prices and volume win. Friedrichstraße down to Kreuzberg.' },
  { id: 'san-francisco', flag: '🇺🇸', name: 'San Francisco', area: 'Downtown', blurb: 'Split city: rich hills next to cheap flats, so every price can work. Nob Hill, the Financial District, SoMa, the Mission.' },
  { id: 'toronto', flag: '🇨🇦', name: 'Toronto', area: 'Downtown', blurb: 'Yorkville luxury, Kensington Market and the Financial District.' },
] as const;

export type CityId = (typeof CITIES)[number]['id'];
