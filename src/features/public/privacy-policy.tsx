/**
 * /privacy: Privacy policy, written from how the product really handles data. Sources:
 * backend ADR-0001 (GCP asia-south1, GCS lifecycle, log retention), ADR-0014 (offboarding, purge,
 * retention: proposed, pending counsel), ADR-0018 (token envelope encryption with Cloud KMS),
 * ADR-0019 (sign-up reviewed by a person), core/passwords.py (argon2id), core/observability.py
 * (Sentry with send_default_pii=False and scrubbing), routers/auth.py (IP and user agent on
 * sign-in and refresh, IP only on sign-out), ADR-0024 and core/config.py (LLM_GATEWAY=openrouter in
 * production: drafting, photo reading, embeddings and image edits all go through OpenRouter with
 * data collection denied), LISTING-AGENT-ANALYSIS §2.8 (no credentials in prompts),
 * ADR-0026, services/public_images.py and images-edge-worker.js (approved listing images copied to a
 * public bucket and served at images.kuinn.in; a 1-day edge cache; removed on delete or replace, a
 * daily sweep retries), vercel.json (site hosting, /api forwarded to api.kuinn.in), prod.env and
 * api-edge-worker.js (EDGE_PROVIDER=cloudflare: Cloudflare ends TLS for api.kuinn.in),
 * core/resolved_facts.py (manufacturer, marketer, packer, importer and consumer-care parties:
 * legal name, address, email, phone, GSTIN), src/api/session.ts (refresh token in localStorage, access token in memory),
 * ADR-0023 and features/mfa/trusted-device.ts (trusted-browser token: localStorage here, a hash on
 * the server, 30 days or 7 for platform admins, removed with any password or authenticator change).
 * Company facts come from ./company (Certificate of Incorporation and Terms, 26 Oct 2026). `Ph` stays for any
 * future fact that is still to be supplied, so it is impossible to miss on the page.
 */
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { PublicLayout } from '@/components/app/public-layout'
import { COMPANY, COMPANY_ADDRESS } from './company'
import { LegalContents } from './legal-contents'
import { useDocumentTitle } from './use-document-title'

/** A fact still to be supplied, impossible to miss on the page. */
export function Ph({ children }: { children: ReactNode }) {
  return (
    <mark data-placeholder className="rounded-[4px] bg-attention-bg px-1 font-semibold text-attention-ink">
      [PLACEHOLDER: {children}]
    </mark>
  )
}

export const POLICY_UPDATED = '8 November 2026'
/** Named by the company: its director, who is also the legal and support contact in the Terms. */
export const GRIEVANCE_OFFICER = 'Mukul Jasoria, Director'

const Mail = () => (
  <a href={`mailto:${COMPANY.email}`} className="hit-area font-semibold text-brand underline-offset-4 hover:underline">
    {COMPANY.email}
  </a>
)

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
          Kuinn gives marketplace sellers software and AI tools to run their business on marketplaces such as Amazon and
          Flipkart. Today it helps brands prepare listings, check them against each marketplace’s rules and send them after
          a person on the brand’s team approves them. We plan to add more, such as reports, recommendations and alerts.
          Kuinn is operated by {COMPANY.legalName}, registered at {COMPANY_ADDRESS} (“we”, “us”).
        </p>
        <p>
          This policy explains what personal data we collect when you request access to or use Kuinn, why we use it,
          who we share it with, how long we keep it and the rights you have under India’s Digital Personal Data Protection Act,
          2023 (“DPDP Act”). For your account data we act as the Data Fiduciary. Contact us at <Mail />.
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
            The party details marketplaces require on a listing, for the manufacturer, marketer, packer, importer and
            consumer-care contact: legal name, address, email, phone number and GSTIN. These can identify a person, such as a
            sole proprietor or a named support contact.
          </li>
          <li>Product photos, which may show people, such as models wearing or holding your products.</li>
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
          <li>Your IP address and browser user agent when you sign in, refresh a session or switch brands, and your IP address when you sign out.</li>
          <li>
            An audit log of important actions (for example approvals, role changes and marketplace connections) with who did
            them, when and from which IP address.
          </li>
          <li>Server logs and error reports for each request, tied to a request reference.</li>
          <li>
            If you choose to trust a browser when you sign in: a short description of it (for example “Chrome on macOS”), when
            you trusted it, when it was last used and when the trust ends.
          </li>
        </ul>
        <p>
          We do not collect payment card details in this version, and we do not knowingly collect sensitive data about you
          such as health or financial information. Please add other people’s personal data only where a listing needs it, such
          as a contact the marketplace requires or a model in a product photo, and only when you have their permission to
          share it with us for that use.
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
          the consent you give when you request access and agree to our{' '}
          <Link to="/terms" className="hit-area font-semibold text-brand underline-offset-4 hover:underline">
            Terms and Conditions
          </Link>
          , and, where the law requires us to keep or share data, the legitimate uses in section 7 of the DPDP Act. You can
          withdraw your consent at any time by writing to us; we will then stop the processing that relies on it and close your
          account. We do not sell your data and we do not use it for advertising.
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
          Kuinn uses AI to draft listings, read details from your product photos, and make white-background versions of
          your main photo. Every AI request goes through OpenRouter (OpenRouter, Inc., United States), which acts as our
          processor and forwards it to the model provider for that task. We send every request with data collection turned
          off, so it is only routed to providers that do not store it for training or reuse.
        </p>
        <ul>
          <li>
            Listing drafts (titles, bullets, descriptions, attributes and keywords): DeepSeek models. They receive the
            product facts needed for the listing and your brand profile.
          </li>
          <li>
            Reading details from your photos: OpenAI models. They receive downscaled copies of your product photos.
          </li>
          <li>
            White-background main images: Google Gemini models, served by Google. They receive a downscaled copy of the
            main photo you choose to edit. You approve every result, and your original is kept.
          </li>
          <li>
            Brand matching: your brand profile and brand documents are turned into text embeddings by OpenAI models, so
            drafts follow your brand.
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
          We do not use your data, or data from your connected marketplace accounts, to train or fine-tune AI models, and our
          AI providers may not use it to train theirs.
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
        <div className="my-4 max-w-full min-w-0 overflow-x-auto rounded-card border border-line bg-surface shadow-raised-md">
          <table className="stack-table w-full text-left text-small sm:min-w-[520px]">
            <thead className="bg-sunken text-ink-2">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Provider</th>
                <th className="px-4 py-2.5 font-semibold">What for</th>
                <th className="px-4 py-2.5 font-semibold">Where</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              <tr>
                <td className="px-4 py-2.5 font-semibold">Google Cloud</td>
                <td data-label="What for" className="px-4 py-2.5">Hosting (Cloud Run), database (Cloud SQL), file storage, key management (Cloud KMS), logs</td>
                <td data-label="Where" className="px-4 py-2.5">India, asia-south1 (Mumbai)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Vercel (Vercel Inc.)</td>
                <td data-label="What for" className="px-4 py-2.5">Hosting the Kuinn website and web app. Requests made to kuinn.in/api pass through it to our API.</td>
                <td data-label="Where" className="px-4 py-2.5">United States, served from its global network</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Cloudflare (Cloudflare, Inc.)</td>
                <td data-label="What for" className="px-4 py-2.5">The secure connection and network edge for all traffic to our API at api.kuinn.in, including sign-in details, login codes and catalog data; serving and caching public listing images at images.kuinn.in</td>
                <td data-label="Where" className="px-4 py-2.5">United States, served from its global network</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">OpenRouter (OpenRouter, Inc.)</td>
                <td data-label="What for" className="px-4 py-2.5">Routes AI requests to the model providers below, with data collection turned off</td>
                <td data-label="Where" className="px-4 py-2.5">United States</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">DeepSeek models, via OpenRouter</td>
                <td data-label="What for" className="px-4 py-2.5">Drafting listing titles, bullets, descriptions, attributes and keywords</td>
                <td data-label="Where" className="px-4 py-2.5">Outside India</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">OpenAI models (OpenAI, L.L.C.), via OpenRouter</td>
                <td data-label="What for" className="px-4 py-2.5">Reading details from product photos; text embeddings of your brand profile and brand documents</td>
                <td data-label="Where" className="px-4 py-2.5">United States</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Google Gemini models, via OpenRouter</td>
                <td data-label="What for" className="px-4 py-2.5">White-background versions of your main photo</td>
                <td data-label="Where" className="px-4 py-2.5">Outside India</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Sentry (Functional Software, Inc.)</td>
                <td data-label="What for" className="px-4 py-2.5">Error monitoring</td>
                <td data-label="Where" className="px-4 py-2.5">Outside India, in Sentry’s hosting region</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          When you connect Amazon or Flipkart and approve a listing, we send that listing to the marketplace on your
          instruction, with its party details and links to its images. From then on the marketplace’s own privacy policy
          applies to what it receives.
        </p>
        <Sub>Public image links</Sub>
        <p>
          Marketplaces fetch listing images from a web link. When you send an approved listing, we copy the prepared version
          of each of its images to a separate public storage bucket on Google Cloud in Mumbai, and give the marketplace a link
          to it on images.kuinn.in, served through Cloudflare. Only images in the approved listing are copied, and packaging
          label photos never are.
        </p>
        <ul>
          <li>
            Each link has a random name that says nothing about your brand or product, and the images cannot be listed or
            browsed. Anyone who has a link can open that one image.
          </li>
          <li>
            When you delete or replace an image in Kuinn, we delete its public copy straight away. If that fails, a daily job
            tries again until it is gone.
          </li>
          <li>
            Cloudflare may keep serving a cached copy for up to one day after it is deleted, and a browser or service that
            already loaded the image may keep its own copy for longer. The copy a marketplace keeps is covered by its own
            policy.
          </li>
        </ul>
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
          Your data is stored on Google Cloud in the asia-south1 (Mumbai) region, India. On its way there, traffic passes
          through Cloudflare’s network, and requests made through kuinn.in/api also pass through Vercel’s network. Both may
          handle it outside India while it is in transit. Data sent to the other providers above may be processed outside
          India as described in their row.
        </p>
        <ul>
          <li>
            All traffic to Kuinn is encrypted in transit (HTTPS). Cloudflare and Vercel decrypt it at their
            edge and send the request on to our servers over a new encrypted connection.
          </li>
          <li>
            Marketplace access tokens are encrypted with keys held in Google Cloud Key Management Service, and they are used
            only by the code that talks to each marketplace.
          </li>
          <li>Passwords are stored only as argon2id hashes.</li>
          <li>
            Every account signs in with a code from an authenticator app. A browser you choose to trust skips that code for up
            to 30 days (7 for platform administrators); we keep only a one-way hash of its token, tied to your account, and
            change the token each time it is used. Sensitive changes, such as connecting a marketplace or changing your team,
            still ask for a fresh code.
          </li>
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
          We keep data only as long as we need it for the purposes above. These are the periods we keep it for. Imported
          rows, sessions and invitations are deleted automatically; the other deletions are carried out by our team when the
          period ends.
        </p>
        <div className="my-4 max-w-full min-w-0 overflow-x-auto rounded-card border border-line bg-surface shadow-raised-md">
          <table className="stack-table w-full text-left text-small sm:min-w-[520px]">
            <thead className="bg-sunken text-ink-2">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Data</th>
                <th className="px-4 py-2.5 font-semibold">Kept for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {[
                ['Account, brand profile, catalog and listings', 'While the brand is active, then 30 days after it is offboarded'],
                ['Imported CSV rows', '90 days after upload'],
                ['Uploaded CSV files', 'Until you ask us to delete them, or the brand is offboarded'],
                ['Public listing image copies', 'Until you delete or replace the image, or the brand is offboarded; edge caches may keep a copy for up to one day after'],
                ['AI run and validation records', '13 months'],
                ['Closed issues and finished tasks', '13 months'],
                ['Audit log', '24 months after the brand’s data is deleted (never less than 12 months)'],
                ['Server logs', '30 days'],
                ['Trusted browsers', 'Until the trust ends (30 days, 7 for platform administrators) or you remove it; deleted daily after that'],
                ['Database backups', 'Expire within 35 days'],
                ['Sign-up requests that are not approved', 'Until you ask us to delete them'],
              ].map(([what, how], i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 font-semibold">{what}</td>
                  <td data-label="Kept for" className="px-4 py-2.5">{how}</td>
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
          A brand owner can ask us to close (offboard) the brand’s workspace by writing to <Mail />. Deletion then
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
          You can disconnect Amazon or Flipkart at any time. If you disconnect in Kuinn, we delete that connection’s access
          tokens straight away. If you remove Kuinn in the marketplace’s own seller account, the marketplace stops accepting
          those tokens at once. Either way, Kuinn can no longer read from or send to that account.
          Listings and other data already in your workspace stay until you ask us to delete them or the brand is offboarded.
        </p>
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
        <p>Kuinn does not use cookies to sign you in, and it uses no advertising or analytics cookies or trackers.</p>
        <ul>
          <li>Your short-lived access token is kept only in the page’s memory and is gone when you close the tab.</li>
          <li>
            A refresh token, valid for about 14 days, is kept in your browser’s local storage so you stay signed in. Signing out
            removes it from your browser and revokes it on our side.
          </li>
          <li>
            If you tick “Trust this browser” when you sign in, a trusted-browser token is kept in local storage, under a key made
            from a one-way hash of your email, so this browser can skip the login code for up to 30 days (7 for platform
            administrators). It stops working when the trust ends, when you remove the browser or sign out all devices in
            Settings &gt; Security, and when you change your password or authenticator, and this browser then deletes it.
            Signing out alone keeps it, so your next sign-in here still skips the code.
          </li>
          <li>
            Local and session storage also keep small conveniences on your device, such as whether the sidebar is collapsed,
            your recent imports and the last job you started, and a product form you have not saved yet, until you save or
            discard it.
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
          To use any of these rights, write to <Mail /> or to our Grievance Officer below. We will respond within 30 days. If you are not satisfied with our response, you may complain to the Data Protection Board
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
        Kuinn is a business tool for people aged 18 or over. We do not knowingly process personal data of children. If
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
        <dl className="my-4 grid gap-x-6 gap-y-2 rounded-card border border-line bg-surface p-5 text-body shadow-raised-md sm:grid-cols-[140px_1fr]">
          <dt className="font-semibold text-ink-2">Name</dt>
          <dd>{GRIEVANCE_OFFICER}</dd>
          <dt className="font-semibold text-ink-2">Email</dt>
          <dd>
            <Mail />
          </dd>
          <dt className="font-semibold text-ink-2">Address</dt>
          <dd>
            {COMPANY.legalName}, {COMPANY_ADDRESS}
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
        We will update this page when how we handle data changes, and change the “Last updated” date at the top. Before a
        new feature collects or uses a new kind of data, we will add it to this policy. If a change materially affects how we
        use your data, we will tell account owners before it takes effect.
      </p>
    ),
  },
]

export function PrivacyPolicy() {
  useDocumentTitle('Privacy policy')
  return (
    <PublicLayout>
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 md:px-8 md:py-14 2xl:max-w-[1320px]">
        <header className="max-w-[62ch]">
          <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.015em] text-ink">
            Privacy policy
          </h1>
          <p className="mt-3 text-body text-ink-2">
            Last updated: {POLICY_UPDATED}. Applies to the Kuinn website, web app and API.
          </p>
        </header>
        <div className="mt-8 grid grid-cols-1 gap-8 lg:mt-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
          <LegalContents sections={POLICY_SECTIONS} number={(_, i) => `${i + 1}.`} />
          <article className="legal min-w-0 max-w-[62ch] text-[15px] leading-[1.65] text-ink">
            {POLICY_SECTIONS.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24 border-t border-line pt-8 pb-4 first:border-t-0 first:pt-0">
                <h2 id={`${s.id}-h`} className="text-h2 text-ink">
                  <a href={`#${s.id}`} className="group/anchor -my-[9px] inline-block py-[9px] no-underline">
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
              Questions? Write to <Mail />, or{' '}
              <Link to="/" className="hit-area font-semibold text-brand underline-offset-4 hover:underline">
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
