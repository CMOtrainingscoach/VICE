/** When true, /leadgen shows Salesbrain (workflows + guided runs). When false, legacy Leadgen UI. */
export function salesbrainEnabled(): boolean {
  const v = process.env.SALESBRAIN_ENABLED?.trim().toLowerCase();
  const pub = process.env.NEXT_PUBLIC_SALESBRAIN_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || pub === "true" || pub === "1";
}

export function salesbrainFixturesEnabled(): boolean {
  const v = process.env.SALESBRAIN_FIXTURES?.trim().toLowerCase();
  return v === "true" || v === "1";
}

export const SALESBRAIN_NAV_LABEL = "Salesbrain";
