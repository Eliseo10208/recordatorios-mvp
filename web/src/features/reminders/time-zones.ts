const frequentZones = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Tijuana",
  "America/Hermosillo",
  "America/Bogota",
  "America/New_York",
  "Europe/Madrid",
  "UTC",
];

const familiarNames: Record<string, string> = {
  "America/Mexico_City": "Ciudad de México",
  "America/Cancun": "Cancún",
  "America/Tijuana": "Tijuana",
  "America/Hermosillo": "Hermosillo",
  "America/Bogota": "Bogotá",
  "America/New_York": "Nueva York",
  "America/Los_Angeles": "Los Ángeles",
  "Europe/Madrid": "Madrid",
  UTC: "Hora universal",
};

const regionNames: Record<string, string> = {
  Africa: "África",
  America: "América",
  Antarctica: "Antártida",
  Arctic: "Ártico",
  Asia: "Asia",
  Atlantic: "Atlántico",
  Australia: "Australia",
  Europe: "Europa",
  Indian: "Océano Índico",
  Pacific: "Pacífico",
};

export function timeZoneLabel(zone: string): string {
  if (familiarNames[zone]) return familiarNames[zone];
  const parts = zone.split("/");
  const city = parts.at(-1)?.replaceAll("_", " ") ?? zone;
  const region = regionNames[parts[0]] ?? parts[0];
  return parts.length > 1 ? `${city} · ${region}` : city;
}

export function timeZoneGroups(current: string, supported: string[]) {
  const all = new Set(
    [...frequentZones, ...supported, current].filter(Boolean),
  );
  const frequent = frequentZones.filter((zone) => all.delete(zone));
  const groups = new Map<string, string[]>();
  for (const zone of all) {
    const region = regionNames[zone.split("/")[0]] ?? "Otras zonas";
    groups.set(region, [...(groups.get(region) ?? []), zone]);
  }
  const compare = new Intl.Collator("es").compare;
  return [
    { name: "Frecuentes", zones: frequent },
    ...[...groups]
      .sort(([a], [b]) => compare(a, b))
      .map(([name, zones]) => ({
        name,
        zones: zones.sort((a, b) =>
          compare(timeZoneLabel(a), timeZoneLabel(b)),
        ),
      })),
  ];
}
