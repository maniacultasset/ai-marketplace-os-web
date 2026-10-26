/**
 * /terms: Terms and Conditions as supplied by the company (Maniacult Technology Pvt Ltd, 26 Oct 2026).
 * The text is the company's own; keep it word for word and change it only from a new company copy.
 * Same layout as the privacy policy so both legal pages read alike.
 */
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { PublicLayout } from '@/components/app/public-layout'
import { COMPANY, COMPANY_ADDRESS } from './company'
import { useDocumentTitle } from './use-document-title'

export const TERMS_EFFECTIVE = '26 October 2026'
export const TERMS_UPDATED = '26 October 2026'
export const LEGAL_EMAIL = COMPANY.email

export interface TermsSection {
  id: string
  title: string
  body: ReactNode
}

const PrivacyLink = () => (
  <Link to="/privacy" className="font-semibold text-brand underline-offset-4 hover:underline">
    Privacy Policy
  </Link>
)

const Mail = () => (
  <a href={`mailto:${LEGAL_EMAIL}`} className="font-semibold text-brand underline-offset-4 hover:underline">
    {LEGAL_EMAIL}
  </a>
)

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'service',
    title: 'The Service',
    body: (
      <>
        <p>
          Kuinn provides software and AI-powered tools to help marketplace sellers analyze and manage aspects of their
          businesses. Depending on your plan, permissions, and settings, the Service may retrieve, organize, analyze,
          summarize, or act on business information from connected accounts and other sources you choose.
        </p>
        <p>
          Features may include recommendations, reports, alerts, workflow automation, and actions in connected marketplace
          accounts. We will describe material permissions and automated actions in the product interface or applicable
          documentation.
        </p>
        <p>
          You remain responsible for your business, marketplace accounts, listings, prices, inventory, orders, advertising,
          customer communications, and compliance with applicable laws and marketplace rules.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts',
    body: (
      <>
        <p>
          You must provide accurate account and billing information and keep it current. You are responsible for protecting
          your login credentials and for activity under your account. Notify us promptly at <Mail /> if you suspect
          unauthorized access.
        </p>
        <p>
          You may use the Service only if you can legally enter into these Terms. You may not share an account except as
          permitted by your plan and the Service’s user controls.
        </p>
      </>
    ),
  },
  {
    id: 'marketplace-connections',
    title: 'Marketplace connections and permissions',
    body: (
      <>
        <p>
          To use an integration, you must authorize the Service through the marketplace’s approved authorization process. Do
          not give us your marketplace username, password, or access keys. We will not ask you to bypass the marketplace’s
          authorization process.
        </p>
        <p>
          You authorize us to access and process the information, and perform the actions, permitted by the permissions you
          grant, solely to provide and support the Service and as described in our <PrivacyLink />. You can manage or revoke
          access through the marketplace or the Service. Revoking access may disable features that depend on that connection.
        </p>
        <p>
          You are responsible for reviewing permissions, instructions, settings, and actions. Where a feature can take action
          automatically, you are responsible for configuring its scope and safeguards. You may pause or disable an agent
          using the controls provided, subject to actions already submitted or in progress.
        </p>
        <p>
          Marketplace services and APIs are operated by third parties. They may change, become unavailable, impose limits, or
          reject actions. We do not control those services and cannot guarantee uninterrupted access or acceptance or
          completion of an action.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Your responsibilities and acceptable use',
    body: (
      <>
        <p>You agree to:</p>
        <ul>
          <li>
            Use the Service only for authorized business purposes and in compliance with these Terms, applicable law, and the
            terms and policies of each connected marketplace.
          </li>
          <li>Provide only information, content, and instructions that you have the right to provide.</li>
          <li>Review outputs and actions for accuracy and suitability.</li>
          <li>Keep your account, integration permissions, and agent settings appropriate to your business.</li>
          <li>
            Notify us promptly if you believe your account or connected information has been accessed or used without
            authorization.
          </li>
        </ul>
        <p>
          You may not use the Service to violate marketplace policies; deceive customers or marketplaces; manipulate reviews
          or rankings; send prohibited communications; infringe another person’s rights; interfere with the Service; access
          another user’s information; or circumvent security, authorization, or usage limits.
        </p>
        <p>
          We may restrict or suspend access if we reasonably believe your use violates these Terms, applicable law, or a
          marketplace requirement.
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'AI features and outputs',
    body: (
      <>
        <p>
          The Service may use artificial intelligence, machine learning, rules, or other automated methods to generate
          recommendations, classifications, summaries, forecasts, or actions. We will describe relevant AI use, calculations,
          data freshness, and material limitations in the product interface or documentation.
        </p>
        <p>
          AI-generated outputs may be incomplete, inaccurate, outdated, or unsuitable for your circumstances. They are not
          legal, tax, accounting, or other professional advice. You are responsible for verifying outputs before relying on
          them, particularly when they may affect prices, inventory, listings, advertising, orders, customer communications,
          or other business-critical matters.
        </p>
        <p>
          We process marketplace information with AI models only as needed to provide the Service. We do not use marketplace
          information retrieved from your connected account to train or fine-tune general-purpose AI models, and we do not
          permit our AI model providers to do so. We do not disclose one seller’s marketplace information to another seller.
          These commitments apply subject to the disclosures in our Privacy Policy and applicable marketplace requirements.
        </p>
      </>
    ),
  },
  {
    id: 'data-privacy',
    title: 'Data and privacy',
    body: (
      <>
        <p>
          Our <PrivacyLink /> explains how we collect, use, store, share, and delete personal information and marketplace
          data. It is part of these Terms. If these Terms conflict with the Privacy Policy concerning personal information,
          the Privacy Policy governs that subject.
        </p>
        <p>
          We use marketplace information only as authorized and as needed to provide the Service, support your account,
          protect the Service, and meet legal obligations. We do not sell marketplace information or use it to build
          cross-customer insights for sale or disclosure. We limit access to personnel and service providers who need it to
          perform their duties and who are subject to appropriate confidentiality and data-protection obligations.
        </p>
        <p>
          We retain information only as long as needed for the purposes described in our Privacy Policy and permitted by
          applicable marketplace requirements and law. When marketplace authorization is revoked or the Service is
          terminated, we will delete or de-identify relevant information within the time required by applicable marketplace
          policies, subject to lawful retention obligations. Amazon customer personal information will be handled and
          retained only as permitted by applicable Amazon policies, including any applicable restrictions on retaining such
          information after order delivery.
        </p>
        <p>
          We maintain administrative, technical, and organizational safeguards designed to protect information. No method of
          transmission or storage is completely secure. If we become aware of a security incident affecting your information,
          we will handle it and provide notice as required by applicable law and our contractual obligations.
        </p>
      </>
    ),
  },
  {
    id: 'fees',
    title: 'Fees, subscriptions, and cancellation',
    body: (
      <>
        <p>
          Fees, billing periods, included usage, and applicable taxes will be shown to you before you purchase or subscribe.
          If a subscription renews automatically, the renewal period and price will be disclosed at checkout.
        </p>
        <p>
          You authorize us or our payment processor to charge the payment method on file for applicable fees and taxes. You
          may cancel through the account or cancellation method provided in the Service. Unless stated otherwise at checkout
          or required by law, cancellation takes effect at the end of the current paid period and does not entitle you to a
          refund for that period.
        </p>
        <p>
          Refunds will be provided where required by applicable law or expressly stated at checkout. We will give notice of
          material price changes before they take effect. If you do not accept a price change, you may cancel before the new
          price applies.
        </p>
      </>
    ),
  },
  {
    id: 'ownership',
    title: 'Ownership and feedback',
    body: (
      <>
        <p>
          We and our licensors own the Service, including its software, design, and documentation. These Terms give you a
          limited, non-exclusive, non-transferable right to use the Service during your subscription, subject to these Terms.
        </p>
        <p>
          You retain your rights in information and content you submit. You authorize us to process it as reasonably
          necessary to provide, secure, and support the Service, and as described in the Privacy Policy.
        </p>
        <p>
          If you provide suggestions or feedback, we may use them without restriction or payment, provided we do not identify
          you publicly without permission.
        </p>
      </>
    ),
  },
  {
    id: 'third-party',
    title: 'Third-party services',
    body: (
      <>
        <p>
          The Service may connect to third-party platforms, including Amazon. Those platforms are governed by their own terms
          and policies. We are not responsible for third-party services, their availability, decisions, or changes.
        </p>
        <p>
          Amazon and its affiliates are not parties to these Terms and are not responsible for the Service. Kuinn is an
          independent service and is not affiliated with, endorsed by, or sponsored by Amazon. “Amazon” and related marks are
          trademarks of Amazon or its affiliates.
        </p>
      </>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and termination',
    body: (
      <>
        <p>
          You may stop using the Service and cancel your subscription under Section 7. We may suspend or terminate your access
          if you materially breach these Terms, create a security or legal risk, fail to pay amounts due, or if a marketplace
          or law requires us to do so. Where reasonably practicable, we will give notice and an opportunity to address the
          issue before suspending access.
        </p>
        <p>
          When these Terms end, your right to use the Service ends. We will handle your information as described in the
          Privacy Policy and Section 6. Terms that by their nature should continue after termination will survive, including
          provisions concerning fees owed, ownership, disclaimers, liability, indemnity, and dispute resolution.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <>
        <p>
          To the maximum extent permitted by law, the Service is provided “as is” and “as available.” We do not warrant that
          it will be uninterrupted, error-free, secure in every circumstance, or compatible with every marketplace system.
        </p>
        <p>
          We do not guarantee business results, sales, profits, account health, listing approval, or marketplace acceptance of
          any action. Nothing in these Terms excludes a warranty or right that cannot legally be excluded.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p>
          To the maximum extent permitted by law, neither party will be liable to the other for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for lost profits, revenue, goodwill, data, or business
          opportunities, arising from or related to the Service or these Terms.
        </p>
        <p>
          To the maximum extent permitted by law, each party’s total liability arising from or related to the Service or
          these Terms will not exceed the fees you paid or owe us for the Service during the twelve months before the event
          giving rise to the claim. This limit does not apply to liability that cannot legally be limited or to your payment
          obligations.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: (
      <p>
        To the extent permitted by law, you will defend and indemnify the Company and its officers, employees, and agents
        against third-party claims, losses, and reasonable costs arising from your unlawful use of the Service, your violation
        of these Terms or marketplace policies, or content and instructions you provide, except to the extent caused by our
        own breach, negligence, or willful misconduct.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these Terms',
    body: (
      <p>
        We may update these Terms to reflect changes to the Service, law, or our business. We will post the updated Terms and
        change the “Last updated” date. For material changes, we will provide reasonable advance notice by email or through
        the Service where practicable. Changes take effect on the stated date. If you do not agree, stop using the Service and
        cancel your subscription.
      </p>
    ),
  },
  {
    id: 'governing-law',
    title: 'Governing law and disputes',
    body: (
      <p>
        These Terms are governed by the laws of India. The courts located in New Delhi, India will have jurisdiction over
        disputes arising from these Terms, subject to any mandatory rights or protections under applicable law.
      </p>
    ),
  },
  {
    id: 'general',
    title: 'General',
    body: (
      <>
        <p>
          These Terms and the documents they incorporate are the entire agreement between you and the Company concerning the
          Service. If a provision is unenforceable, the remaining provisions remain in effect. You may not assign these Terms
          without our written consent. We may assign them as part of a merger, reorganization, or sale of substantially all
          relevant assets. Our failure to enforce a provision is not a waiver.
        </p>
        <p>Notices to us must be sent to the contact details below.</p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <address className="my-2 rounded-card border border-line bg-surface p-5 text-body not-italic shadow-raised-md">
        <span className="font-semibold">{COMPANY.legalName}</span>
        {COMPANY.addressLines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
        <span className="mt-3 block">
          Phone:{' '}
          <a href={COMPANY.phoneHref} className="font-semibold text-brand underline-offset-4 hover:underline">
            {COMPANY.phone}
          </a>
        </span>
        <span className="block">
          Legal and support: <Mail />
        </span>
      </address>
    ),
  },
]

export function Terms() {
  useDocumentTitle('Terms and Conditions')
  return (
    <PublicLayout>
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8 md:py-14">
        <header className="max-w-[72ch]">
          <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.015em] text-ink">
            Terms and Conditions
          </h1>
          <p className="mt-3 text-body text-ink-2">
            Effective date: {TERMS_EFFECTIVE} · Last updated: {TERMS_UPDATED}
          </p>
        </header>
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <details open className="group rounded-card border border-line bg-surface p-4 shadow-raised-sm lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
              <summary className="cursor-pointer text-small font-bold text-ink lg:pointer-events-none lg:list-none">On this page</summary>
              <ol className="mt-3 flex flex-col gap-1 text-small">
                {TERMS_SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="tactile flex gap-2 rounded-control px-2 py-1.5 text-ink-2 hover:bg-hover hover:text-ink active:bg-pressed"
                    >
                      <span className="w-5 shrink-0 text-ink-3 tabular-nums">{s.id === 'contact' ? null : `${i + 1}.`}</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>
          <article className="legal max-w-[72ch] text-[15px] leading-[1.65] text-ink">
            <div className="mb-8 flex flex-col gap-3">
              <p>
                These Terms and Conditions (“Terms”) govern your access to and use of <strong>Kuinn</strong>, including its
                website at{' '}
                <a href={COMPANY.website} className="font-semibold text-brand underline-offset-4 hover:underline">
                  {COMPANY.website}
                </a>
                , software, AI agents, integrations, and related services (collectively, the “Service”).
              </p>
              <p>
                The Service is provided by <strong>{COMPANY.legalName}</strong>, a private limited company organized
                under the laws of India, with its registered office at{' '}
                <strong>{COMPANY_ADDRESS}</strong> (“Company,” “we,” “us,” or “our”).
              </p>
              <p>
                By creating an account, connecting a marketplace account, or using the Service, you agree to these Terms. If
                you use the Service for a business, you represent that you have authority to bind that business. If you do not
                agree to these Terms, do not use the Service.
              </p>
            </div>
            {TERMS_SECTIONS.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24 border-t border-line pt-8 pb-4">
                <h2 id={`${s.id}-h`} className="text-h2 text-ink">
                  <a href={`#${s.id}`} className="group/anchor no-underline">
                    {/* The contact block closes the Terms and is not a numbered section in the company's text. */}
                    {s.id === 'contact' ? null : <span className="mr-2 text-ink-3 tabular-nums">{i + 1}.</span>}
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
              Read our <PrivacyLink />, or{' '}
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
