/**
 * What the review page may say and offer about publishing a listing, from the deployment's
 * Amazon switch (GET /tenants/me capabilities). While it is off, nothing offers or promises a send.
 */
export interface PublishGate {
  /** Show the paused line (review page, approved banner, approve bar). */
  paused: boolean
  /** Publish, retry and "Approve and resend" may be offered. */
  publishBuilt: boolean
}

export function publishGate(
  marketplace: string,
  amazonPublishing: { paused: boolean; known: boolean },
  built: boolean,
): PublishGate {
  if (marketplace !== 'amazon') return { paused: false, publishBuilt: built }
  const paused = amazonPublishing.paused
  // Publish waits for the read, so it is never shown and then taken back.
  return { paused, publishBuilt: built && amazonPublishing.known && !paused }
}
