import type { CountryOption } from "./layoutTypes";

const COUNTRY_CODE_BY_NAME: Partial<Record<CountryOption, string>> = {
  Japan: "JP",
  "United States": "US",
  "South Korea": "KR",
  China: "CN",
  Taiwan: "TW",
  "Hong Kong": "HK",
  Philippines: "PH",
  Thailand: "TH",
  Vietnam: "VN",
  Indonesia: "ID",
  Malaysia: "MY",
  Singapore: "SG",
  India: "IN",
  "United Kingdom": "GB",
  Germany: "DE",
  France: "FR",
  Spain: "ES",
  Italy: "IT",
  Brazil: "BR",
  Mexico: "MX",
  "Saudi Arabia": "SA",
  Turkey: "TR",
};

const COUNTRY_NAME_BY_CODE: Record<
  string,
  Exclude<CountryOption, "Global">
> = Object.fromEntries(
  Object.entries(COUNTRY_CODE_BY_NAME).map(([name, code]) => [code, name]),
) as Record<string, Exclude<CountryOption, "Global">>;

const COUNTRY_FLAG_BY_CODE: Record<string, string> = {
  JP: "\u{1F1EF}\u{1F1F5}",
  US: "\u{1F1FA}\u{1F1F8}",
  KR: "\u{1F1F0}\u{1F1F7}",
  CN: "\u{1F1E8}\u{1F1F3}",
  TW: "\u{1F1F9}\u{1F1FC}",
  HK: "\u{1F1ED}\u{1F1F0}",
  PH: "\u{1F1F5}\u{1F1ED}",
  TH: "\u{1F1F9}\u{1F1ED}",
  VN: "\u{1F1FB}\u{1F1F3}",
  ID: "\u{1F1EE}\u{1F1E9}",
  MY: "\u{1F1F2}\u{1F1FE}",
  SG: "\u{1F1F8}\u{1F1EC}",
  IN: "\u{1F1EE}\u{1F1F3}",
  GB: "\u{1F1EC}\u{1F1E7}",
  DE: "\u{1F1E9}\u{1F1EA}",
  FR: "\u{1F1EB}\u{1F1F7}",
  ES: "\u{1F1EA}\u{1F1F8}",
  IT: "\u{1F1EE}\u{1F1F9}",
  BR: "\u{1F1E7}\u{1F1F7}",
  MX: "\u{1F1F2}\u{1F1FD}",
  SA: "\u{1F1F8}\u{1F1E6}",
  TR: "\u{1F1F9}\u{1F1F7}",
};

export function getCountryCode(country: string): string {
  const normalized = country.trim();
  const upper = normalized.toUpperCase();

  if (upper === "GLOBAL") {
    return "GL";
  }

  // Already a 2-letter country code (e.g. "JP", "US")
  if (COUNTRY_FLAG_BY_CODE[upper]) {
    return upper;
  }

  // Full country name (e.g. "Japan", "United States")
  return COUNTRY_CODE_BY_NAME[normalized as CountryOption] ?? "";
}

export function getFlagEmoji(countryCode: string): string {
  const normalizedCode = countryCode.trim().toUpperCase();
  return COUNTRY_FLAG_BY_CODE[normalizedCode] ?? "";
}

export function getCountryFlag(country: string): string {
  if (getCountryCode(country) === "GL") {
    return "\u{1F310}";
  }

  return getFlagEmoji(getCountryCode(country));
}

export function getCountryName(country: string): string {
  const normalizedCountry = country.trim();

  if (normalizedCountry.toUpperCase() === "GLOBAL") {
    return "Global";
  }

  return COUNTRY_NAME_BY_CODE[getCountryCode(normalizedCountry)] ?? normalizedCountry;
}
