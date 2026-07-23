declare module "tz-lookup" {
  /** Returns the IANA timezone name for a latitude/longitude. */
  export default function tzLookup(lat: number, lon: number): string;
}
