export async function notifyWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function notifyDriftFailure(args: {
  slackWebhook?: string;
  discordWebhook?: string;
  project: string;
  driftedSymbols: number;
  undocumentedSymbols: number;
  unusedDocBlocks: number;
  coveragePercent: number;
}): Promise<void> {
  const message = {
    text: `[doc-sync-check] Drift detected in ${args.project}. drifted=${args.driftedSymbols}, undocumented=${args.undocumentedSymbols}, unused_doc_blocks=${args.unusedDocBlocks}, coverage=${args.coveragePercent}%`,
  };

  if (args.slackWebhook) {
    await notifyWebhook(args.slackWebhook, message);
  }
  if (args.discordWebhook) {
    await notifyWebhook(args.discordWebhook, { content: message.text });
  }
}
