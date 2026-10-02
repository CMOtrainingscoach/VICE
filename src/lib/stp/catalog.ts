import type { StpInputs, StpRef } from "@/lib/stp/types";

export type StpSource = {
  key: string;
  ref: StpRef;
  text: string;
};

/** Alleen goedgekeurde, niet-afgewezen inzichten. Geen bedragen uit de waardeketen. */
export function buildStpCatalog(inputs: StpInputs): StpSource[] {
  const sources: StpSource[] = [];
  const push = (ref: StpRef, text: string) => {
    const body = text.trim();
    if (!body) return;
    sources.push({ key: `S${sources.length + 1}`, ref, text: body });
  };

  push(
    { ref_type: "tenant_profile", ref_id: inputs.tenant.id, label: inputs.tenant.name, excerpt: inputs.tenant.audit_goal, slot: "general" },
    [inputs.tenant.name, inputs.tenant.audit_goal].filter(Boolean).join("\n"),
  );
  for (const item of inputs.five_c_items) {
    push(
      { ref_type: "five_c_item", ref_id: item.id, label: `5C · ${item.title}`, excerpt: item.finding.slice(0, 240), slot: "customer" },
      [item.title, item.finding, item.client_relevance].filter(Boolean).join("\n"),
    );
  }
  for (const item of inputs.swot_items) {
    push(
      { ref_type: "swot_item", ref_id: item.id, label: `SWOT · ${item.quadrant}`, excerpt: item.statement.slice(0, 240), slot: "general" },
      item.statement,
    );
  }
  for (const item of inputs.vrio_resources) {
    push(
      { ref_type: "vrio_resource", ref_id: item.id, label: `VRIO · ${item.title}`, excerpt: item.description.slice(0, 240), slot: "capability" },
      [item.title, item.description].filter(Boolean).join("\n"),
    );
  }
  for (const item of inputs.pestel_insights) {
    push(
      { ref_type: "pestel_insight", ref_id: item.id, label: `PESTEL · ${item.title}`, excerpt: item.observation.slice(0, 240), slot: "context" },
      [item.title, item.observation].filter(Boolean).join("\n"),
    );
  }
  for (const item of inputs.porter_forces) {
    push(
      { ref_type: "porter_force", ref_id: item.id, label: `Porter · ${item.headline_factor || item.force_key}`, excerpt: item.motivation.slice(0, 240), slot: "context" },
      [item.headline_factor, item.motivation].filter(Boolean).join("\n"),
    );
  }
  for (const item of inputs.bcg_items) {
    push(
      { ref_type: "bcg_item", ref_id: item.id, label: `BCG · ${item.title}`, excerpt: item.market.slice(0, 240), slot: "offer" },
      `${item.title}. Een BCG-positie bewijst geen klantbehoefte.`,
    );
  }
  for (const item of inputs.vc_activities) {
    push(
      { ref_type: "vc_activity", ref_id: item.id, label: `Waardeketen · ${item.name}`, excerpt: item.customer_value.slice(0, 240), slot: "delivery" },
      [item.name, item.customer_value, item.execution === "unknown" ? "" : `Uitvoering: ${item.execution}`].filter(Boolean).join("\n"),
    );
  }
  for (const item of inputs.meetings) {
    push(
      { ref_type: "meeting", ref_id: item.id, label: `Meeting · ${item.title}`, excerpt: item.text.slice(0, 240), slot: "customer" },
      item.text,
    );
  }
  return sources;
}

export function customerSignalCount(inputs: StpInputs): number {
  return inputs.five_c_items.filter((item) => item.c_key === "customers" || item.c_key === "company").length + inputs.meetings.length;
}
