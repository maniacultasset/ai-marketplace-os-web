/**
 * /privacy: Privacy policy DRAFT, written from how the product really handles data. Sources:
 * backend ADR-0001 (GCP asia-south1, GCS lifecycle, log retention), ADR-0014 (offboarding, purge,
 * retention: proposed, pending counsel), ADR-0018 (token envelope encryption with Cloud KMS),
 * ADR-0019 (sign-up reviewed by a person), core/passwords.py (argon2id), core/observability.py
 * (Sentry with send_default_pii=False and scrubbing), routers/auth.py (IP and user agent on
 * sign-in and refresh, IP only on sign-out), services/embeddings.py (the only model call today:
 * embeddings of the brand profile and documents; drafting is not built), LISTING-AGENT-ANALYSIS §2.8 (no credentials in prompts, signed image URLs
 * ≤10 min), src/api/session.ts (refresh token in localStorage, access token in memory).
 * Every fact a lawyer or the company must supply is a visible [PLACEHOLDER: …].
 */
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { PublicLayout } from '@/components/app/public-layout'
import { Banner } from '@/components/la/banner'
import { useDocumentTitle } from './use-document-title'

/** A fact still to be supplied, impossible to miss on the page. */
export function Ph({ children }: { children: ReactNode }) {
  return (
    <mark data-placeholder className="rounded-[4px] bg-attention-bg px-1 font-semibold text-attention-ink">
      [PLACEHOLDER: {children}]
    </mark>
  )
}

export interface PolicySection {
  id: string
  title: string
  body: ReactNode
}

const Sub = ({ children }: { children: ReactNode }) => <h3 className="mt-6 text-h3 text-ink">{children}</h3>

export const POLICY_SECTIONS: PolicySection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          Listing Agent is a web application that helps brands prepare marketplace listings, check them against marketplace
          rules and send them after a person on the brand’s team approves them. It is operated by <Ph>company legal name</Ph>,
          registered at <Ph>registered address</Ph> (“we”, “us”).
        </p>
        <p>
          This policy explains what personal data we collect when you request access to or use Listing Agent, why we use it,
          who we share it with, how long we keep it and the rights you have under India’s Digital Personal Data Protection Act,
          2023 (“DPDP Act”). For your account data we act as the Data Fiduciary. Contact us at <Ph>contact email</Ph>.
        </p>
      </>
    ),
  },
  {
    id: 'data-we-collect',
    title: 'Data we collect',
    body: (
      <>
        <Sub>When you request access</Sub>
        <ul>
          <li>Brand name, your name and your work email.</li>
          <li>Your phone number and website, if you give them.</li>
          <li>
            The password you choose. We store only a one-way argon2id hash of it, never the password itself.
          </li>
          <li>The review decision on your request and, if it is not approved, the reviewer’s reason.</li>
        </ul>
        <Sub>When you use your account</Sub>
        <ul>
          <li>Your name, email, the brands you belong to and your role in each (owner, operator, reviewer or admin).</li>
          <li>
            Your brand profile: tone of voice, guidelines, glossary, banned terms and any brand documents you upload.
          </li>
          <li>
            Your catalog: products, variants, attributes, prices, product images and the CSV files you import.
          </li>
          <li>
            Listings and their history: every draft version, validation result, approval (who approved and when) and what was
            sent to each marketplace.
          </li>
          <li>
            Marketplace connections: the access tokens Amazon or Flipkart issue when you connect a seller account, and the
            seller account identifiers.
          </li>
        </ul>
        <Sub>Collected automatically</Sub>
        <ul>
          <li>Your IP address and browser user agent when you sign in or refresh a session, and your IP address when you sign out.</li>
          <li>
            An audit log of important actions (for example approvals, role changes and marketplace connections) with who did
            them, when and from which IP address.
          </li>
          <li>Server logs and error reports for each request, tied to a request reference.</li>
        </ul>
        <p>
          We do not collect payment card details in this version, and we do not knowingly collect sensitive data about you
          such as health or financial information. Product data you upload is about your products; please do not include
          other people’s personal data in it.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use your data',
    body: (
      <>
        <ul>
          <li>To review your access request and open your brand’s workspace.</li>
          <li>To sign you in, keep your session secure and keep each brand’s data separate from every other brand’s.</li>
          <li>
            To draft listings from your product data and brand profile, check them against marketplace rules and show them to
            your team for approval.
          </li>
          <li>To send approved listings to the marketplaces you connected, and to show you what the marketplace answered.</li>
          <li>To keep an audit trail of approvals and other important actions.</li>
          <li>To find and fix errors, prevent abuse (for example by rate-limiting sign-in attempts) and keep the service running.</li>
          <li>To contact you about your account or this service.</li>
        </ul>
        <p>
          The lawful basis for each purpose above is{' '}
          <Ph>
            counsel to confirm the lawful basis for each purpose under sections 6 and 7 of the DPDP Act. If consent is relied
            on, the sign-up form must first record it: today its privacy-policy checkbox is not sent to or stored by our servers
          </Ph>
          . We do not sell your data and we do not use it for advertising.
        </p>
      </>
    ),
  },
  {
    id: 'ai-processing',
    title: 'How AI is used',
    body: (
      <>
        <p>
          Today the only AI processing is turning your brand profile (tone of voice, guidelines, glossary) and the brand
          documents you upload into text embeddings, so that drafts can later follow your brand. The embedding provider is{' '}
          <Ph>AI provider name, its role as our processor and its processing region</Ph>.
        </p>
        <p>
          AI drafting of titles, bullets, descriptions and attributes is in development and is not running yet. Before it
          launches we will update this section with the model provider and what it receives. As designed, it will receive:
        </p>
        <ul>
          <li>
            the product facts and images needed for the listing and your brand profile. Images will be sent either as
            downscaled copies or as signed links that expire within 10 minutes.
          </li>
        </ul>
        <p>In every case:</p>
        <ul>
          <li>What we never send: passwords, marketplace access tokens or other credentials.</li>
          <li>Every AI call is recorded in a run log, so we can trace which content the AI wrote.</li>
          <li>
            The AI never decides whether a listing is sent. Fixed rules check every field, and a person on your team must
            approve before anything goes to a marketplace.
          </li>
        </ul>
        <p>
          The provider’s retention and training terms for this data: <Ph>confirm the AI provider’s data processing terms and
          retention setting in use</Ph>.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share data with',
    body: (
      <>
        <p>We share data only with these service providers, and only for the purposes above:</p>
        <div className="my-4 max-w-full min-w-0 overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[520px] text-left text-small">
            <thead className="bg-canvas text-ink-2">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Provider</th>
                <th className="px-4 py-2.5 font-semibold">What for</th>
                <th className="px-4 py-2.5 font-semibold">Where</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              <tr>
                <td className="px-4 py-2.5 font-semibold">Google Cloud</td>
                <td className="px-4 py-2.5">Hosting (Cloud Run), database (Cloud SQL), file storage, key management (Cloud KMS), logs</td>
                <td className="px-4 py-2.5">India, asia-south1 (Mumbai)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">
                  <Ph>AI provider</Ph>
                </td>
                <td className="px-4 py-2.5">Text embeddings of your brand profile and brand documents (and, once launched, drafting listing content)</td>
                <td className="px-4 py-2.5">
                  <Ph>processing region</Ph>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Sentry (Functional Software, Inc.)</td>
                <td className="px-4 py-2.5">Error monitoring</td>
                <td className="px-4 py-2.5">
                  <Ph>data region</Ph>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          When you connect Amazon or Flipkart and approve a listing, we send that listing to the marketplace on your
          instruction. From then on the marketplace’s own privacy policy applies to what it receives.
        </p>
        <p>
          We may disclose data when the law requires it, for example to comply with a valid order from a court or government
          authority in India.
        </p>
      </>
    ),
  },
  {
    id: 'storage-security',
    title: 'Where data is stored and how it is protected',
    body: (
      <>
        <p>
          Your data is stored on Google Cloud in the asia-south1 (Mumbai) region, India. Data sent to the providers above may
          be processed outside India as described in their row.
        </p>
        <ul>
          <li>All traffic to Listing Agent is encrypted in transit (HTTPS).</li>
          <li>
            Marketplace access tokens are encrypted with keys held in Google Cloud Key Management Service, and they are used
            only by the code that talks to each marketplace.
          </li>
          <li>Passwords are stored only as argon2id hashes.</li>
          <li>
            Each brand’s data is separated at the database level, so one brand’s users cannot read another brand’s rows.
          </li>
          <li>The audit log is append-only: the application cannot change or delete its entries.</li>
          <li>Error reports are sent without request bodies or default personal data, and known secrets are scrubbed first.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep data',
    body: (
      <>
        <p>
          The periods below are our current proposal and are pending legal review <Ph>counsel to confirm retention periods</Ph>.
        </p>
        <div className="my-4 max-w-full min-w-0 overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[520px] text-left text-small">
            <thead className="bg-canvas text-ink-2">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Data</th>
                <th className="px-4 py-2.5 font-semibold">Kept for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {[
                ['Account, brand profile, catalog and listings', 'While the brand is active, then 30 days after it is offboarded'],
                ['Imported CSV files', '30 days after upload'],
                ['AI run and validation records', '13 months'],
                ['Closed issues and finished tasks', '13 months'],
                ['Audit log', '24 months after the brand’s data is deleted (never less than 12 months)'],
                ['Server logs', '30 days'],
                ['Database backups', 'Expire within 35 days'],
                ['Sign-up requests that are not approved', <Ph key="s">retention period</Ph>],
              ].map(([what, how], i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 font-semibold">{what}</td>
                  <td className="px-4 py-2.5">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'deletion',
    title: 'Closing your account and deleting data',
    body: (
      <>
        <p>
          A brand owner can ask us to close (offboard) the brand’s workspace by writing to <Ph>contact email</Ph>. Deletion then
          happens in two steps:
        </p>
        <ol>
          <li>
            <strong>After a 30-day grace period</strong>, we delete the brand’s profile, catalog, images, listings, marketplace
            connections and other workspace data. In the audit log we remove the email and IP address of the people who acted.
            People who belong to no other brand have their personal details replaced with an anonymous placeholder.
          </li>
          <li>
            <strong>After the audit retention period</strong>, we delete the remaining audit entries, the brand record and any
            user accounts left without a brand.
          </li>
        </ol>
        <p>
          You can also ask us to erase your own personal data at any time (see “Your rights”). If you are the last owner of a
          brand, we will ask the brand to name another owner first. Backups that already contain your data expire on their own
          schedule.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    body: (
      <>
        <p>Listing Agent does not use cookies to sign you in, and it uses no advertising or analytics cookies or trackers.</p>
        <ul>
          <li>Your short-lived access token is kept only in the page’s memory and is gone when you close the tab.</li>
          <li>
            A refresh token, valid for about 14 days, is kept in your browser’s local storage so you stay signed in. Signing out
            removes it from your browser and revokes it on our side.
          </li>
          <li>
            Local and session storage also keep small conveniences on your device, such as whether the sidebar is collapsed,
            your recent imports and the last job you started.
          </li>
          <li>Fonts are served from our own domain, so loading a page does not contact a font provider.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the DPDP Act you have the right to:</p>
        <ul>
          <li>get a summary of the personal data we process about you and the processing we do with it;</li>
          <li>have inaccurate or incomplete data corrected, completed or updated;</li>
          <li>have your personal data erased when it is no longer needed for the purpose it was collected for;</li>
          <li>withdraw consent you gave, as easily as you gave it (this does not affect processing done before);</li>
          <li>have a grievance about our handling of your data addressed; and</li>
          <li>nominate another person to exercise these rights for you in case of death or incapacity.</li>
        </ul>
        <p>
          To use any of these rights, write to <Ph>contact email</Ph> or to our Grievance Officer below. We will respond within{' '}
          <Ph>response period</Ph>. If you are not satisfied with our response, you may complain to the Data Protection Board
          of India.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        Listing Agent is a business tool for people aged 18 or over. We do not knowingly process personal data of children. If
        you believe a child has given us personal data, contact us and we will delete it.
      </p>
    ),
  },
  {
    id: 'grievance-officer',
    title: 'Grievance Officer',
    body: (
      <>
        <p>For questions or complaints about this policy or our handling of your data, contact our Grievance Officer:</p>
        <dl className="my-4 grid gap-x-6 gap-y-2 rounded-card border border-line bg-surface p-5 text-body sm:grid-cols-[140px_1fr]">
          <dt className="font-semibold text-ink-2">Name</dt>
          <dd>
            <Ph>grievance officer name</Ph>
          </dd>
          <dt className="font-semibold text-ink-2">Email</dt>
          <dd>
            <Ph>grievance officer email</Ph>
          </dd>
          <dt className="font-semibold text-ink-2">Address</dt>
          <dd>
            <Ph>registered address</Ph>
          </dd>
        </dl>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We will update this page when how we handle data changes, and change the “Last updated” date at the top. If a change
        materially affects how we use your data, we will tell account owners before it takes effect.
      </p>
    ),
  },
]

export function PrivacyPolicy() {
  useDocumentTitle('Privacy policy')
  return (
    <PublicLayout>
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8 md:py-14">
        <div data-testid="privacy-draft" className="max-w-[72ch]">
          <Banner tone="attention" title="Draft, pending legal review">
            This policy describes how Listing Agent handles data today, but a lawyer has not reviewed it yet. Items marked
            [PLACEHOLDER] still need to be filled in.
          </Banner>
        </div>
        <header className="mt-8 max-w-[72ch]">
          <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.015em] text-ink">
            Privacy policy
          </h1>
          <p className="mt-3 text-body text-ink-2">
            Last updated: <Ph>date</Ph> · Applies to the Listing Agent web app and API
          </p>
        </header>
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <details open className="group rounded-card border border-line bg-surface p-4 lg:border-0 lg:bg-transparent lg:p-0">
              <summary className="cursor-pointer text-small font-bold text-ink lg:pointer-events-none lg:list-none">On this page</summary>
              <ol className="mt-3 flex flex-col gap-1 text-small">
                {POLICY_SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex gap-2 rounded-control px-2 py-1.5 text-ink-2 hover:bg-subtle hover:text-ink"
                    >
                      <span className="w-5 shrink-0 text-ink-3 tabular-nums">{i + 1}.</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>
          <article className="legal max-w-[72ch] text-[15px] leading-[1.65] text-ink">
            {POLICY_SECTIONS.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24 border-t border-line pt-8 pb-4 first:border-t-0 first:pt-0">
                <h2 id={`${s.id}-h`} className="text-h2 text-ink">
                  <a href={`#${s.id}`} className="group/anchor no-underline">
                    <span className="mr-2 text-ink-3 tabular-nums">{i + 1}.</span>
                    {s.title}
                    <span aria-hidden className="ml-2 text-brand opacity-0 group-hover/anchor:opacity-100 group-focus-visible/anchor:opacity-100">
                      #
                    </span>
                  </a>
                </h2>
                <div className="mt-3 flex flex-col gap-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_li]:pl-1 [&_li]:marker:text-ink-3">
                  {s.body}
                </div>
              </section>
            ))}
            <p className="mt-8 border-t border-line pt-6 text-small text-ink-2">
              Questions? Write to <Ph>contact email</Ph>, or{' '}
              <Link to="/" className="font-semibold text-brand underline-offset-4 hover:underline">
                go back to the home page
              </Link>
              .
            </p>
          </article>
        </div>
      </div>
    </PublicLayout>
  )
}
