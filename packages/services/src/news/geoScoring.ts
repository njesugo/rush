/** Port TS de one/src/services/geoScoring.js */

const FR_EU_HOSTS = [
  "lemonde.fr", "lefigaro.fr", "lesechos.fr", "liberation.fr", "latribune.fr",
  "numerama.fr", "numerama.com", "usine-digitale.fr", "usinenouvelle.com",
  "frandroid.com", "01net.com", "clubic.com", "zdnet.fr", "journaldunet.com",
  "maddyness.com", "frenchweb.fr", "actuia.com", "siecledigital.fr",
  "bfmtv.com", "francetvinfo.fr", "radiofrance.fr", "lepoint.fr",
  "sifted.eu", "eu-startups.com", "tech.eu", "theregister.com",
  "ft.com", "euronews.com", "politico.eu", "reuters.com",
  "heise.de", "golem.de", "spiegel.de", "handelsblatt.com",
  "elpais.com", "elmundo.es", "expansion.com",
  "corriere.it", "repubblica.it", "ilsole24ore.com",
  "nrc.nl", "volkskrant.nl",
];

const US_AFRICA_MAJORS = [
  "techcrunch.com", "theverge.com", "wired.com", "arstechnica.com",
  "bloomberg.com", "wsj.com", "nytimes.com", "washingtonpost.com",
  "cnbc.com", "forbes.com", "businessinsider.com", "theinformation.com",
  "venturebeat.com", "axios.com", "semafor.com",
  "techcabal.com", "techpoint.africa", "disrupt-africa.com", "ventureburn.com",
  "jeuneafrique.com", "africanews.com", "afrik.com", "we-are-tech.com",
];

export type Region = "FR/EU" | "US/AFRICA" | "OTHER";

function hostOf(urlOrSource?: string | null): string {
  if (!urlOrSource) return "";
  try {
    if (urlOrSource.includes("://")) {
      return new URL(urlOrSource).hostname.replace(/^www\./, "").toLowerCase();
    }
  } catch {}
  const m = String(urlOrSource).match(/·\s*([\w.-]+)/);
  return m ? m[1].toLowerCase() : "";
}

export function geoScore(item: { url?: string | null; source?: string | null }): {
  score: number;
  region: Region;
} {
  const host = hostOf(item.url) || hostOf(item.source);
  if (!host) return { score: 0, region: "OTHER" };
  if (FR_EU_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
    return { score: 10, region: "FR/EU" };
  }
  if (US_AFRICA_MAJORS.some((h) => host === h || host.endsWith("." + h))) {
    return { score: 3, region: "US/AFRICA" };
  }
  return { score: 0, region: "OTHER" };
}

export { FR_EU_HOSTS, US_AFRICA_MAJORS };
