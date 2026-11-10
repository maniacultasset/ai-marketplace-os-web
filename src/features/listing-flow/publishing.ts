/**
 * What a screen may say and offer about publishing a listing, from the deployment's Amazon switch
 * (GET /tenants/me capabilities). While it is off, nothing offers or promises a send: no Publish,
 * retry or resend, and an approved Amazon listing reads "Approved · publishing paused".
 */
import { BUILT } from '@/api/capabilities'
import { AMAZON_PUBLISHING_PAUSED_TEXT, useAmazonPublishing } from '@/features/brand/api'
import { APPROVED_PAUSED_LABEL, type ChipContext } from '@/lib/listing-chip'

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

/** publishGate for one listing's marketplace, with the shipped Publish capability. */
export function usePublishGate(marketplace: string): PublishGate {
  return publishGate(marketplace, useAmazonPublishing(), BUILT['listings.publish'])
}

/** The chip context every listing chip reads (listingChip, cellChip, overallStatus). */
export function useChipContext(): ChipContext {
  return { amazonPublishingPaused: useAmazonPublishing().paused }
}

/**
 * The Live screen's hero for a listing not sent yet. While publishing is paused it never reads as
 * going out: an approved one is "Approved · publishing paused", any other says approving keeps it ready.
 */
export function notSentHero(title: string, mp: string, pause?: { paused: boolean; approved: boolean }): { title: string; line: string } {
  if (pause?.paused)
    return { title: pause.approved ? `${title}: ${APPROVED_PAUSED_LABEL}` : `${title} has not been sent to ${mp}`, line: AMAZON_PUBLISHING_PAUSED_TEXT }
  return { title: `${title} has not been sent to ${mp}`, line: 'It goes out after a person approves it and it is published.' }
}
