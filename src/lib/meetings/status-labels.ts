export function reviewStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Wacht op transcript";
    case "in_review":
      return "Te reviewen";
    case "approved":
      return "Goedgekeurd";
    default:
      return status;
  }
}

export function analysisStatusLabel(status: string): string {
  switch (status) {
    case "none":
      return "Nog geen analyse";
    case "pending":
      return "Analyse bezig";
    case "ready":
      return "Analyse klaar";
    case "failed":
      return "Analyse mislukt";
    default:
      return status;
  }
}

export function transcriptStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Transcript open";
    case "processing":
      return "Transcriberen…";
    case "ready":
      return "Transcript klaar";
    case "failed":
      return "Transcript mislukt";
    default:
      return status;
  }
}
