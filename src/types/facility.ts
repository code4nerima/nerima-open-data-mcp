export type NullableNumber = number | null;

export interface Facility {
  name: string;
  category: string;
  address: string;
  latitude: NullableNumber;
  longitude: NullableNumber;
  phone: string;
  notes: string;
}

export interface AedLocation {
  facilityName: string;
  installationLocation: string;
  address: string;
  latitude: NullableNumber;
  longitude: NullableNumber;
  availableHours: string;
  notes: string;
}

export interface Shelter {
  name: string;
  type: string;
  address: string;
  latitude: NullableNumber;
  longitude: NullableNumber;
  targetDisasters: string;
  capacity: NullableNumber;
  capacityText: string;
  notes: string;
}

export interface Park {
  name: string;
  address: string;
  latitude: NullableNumber;
  longitude: NullableNumber;
  area: string;
  facilities: string;
  notes: string;
}

export interface FacilitySearchArgs {
  keyword?: string;
  category?: string;
  area?: string;
  limit?: number;
}

export interface BasicSearchArgs {
  keyword?: string;
  area?: string;
  limit?: number;
}

export interface SearchResult<T> {
  [key: string]: unknown;
  count: number;
  results: T[];
}
