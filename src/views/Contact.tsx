/** @jsxImportSource hono/jsx */
import { Layout } from "./Layout";
import { SiteHeader } from "./partials/SiteHeader";
import { SiteFooter } from "./partials/SiteFooter";

export interface ContactFormValues {
  name: string;
  email: string;
  message: string;
}

interface ContactPageProps {
  sent?: boolean;
  error?: string;
  mailerConfigured: boolean;
  contactEmail: string;
  values?: ContactFormValues;
}

export function ContactPage({
  sent,
  error,
  mailerConfigured,
  contactEmail,
  values,
}: ContactPageProps) {
  const name = values?.name ?? "";
  const email = values?.email ?? "";
  const message = values?.message ?? "";

  return (
    <Layout
      title="Contact — Webklip"
      description="Send feedback, questions, or privacy requests to the Webklip team."
      themeToggle="none"
      bodyClass="with-chrome"
    >
      <SiteHeader />
      <main class="home account-page contact-page">
        <h1>Contact</h1>
        {sent ? (
          <>
            <p class="success">
              Thanks — your message is on its way. We read every note and reply when we
              can.
            </p>
            <p class="hint">
              <a href="/contact">Send another message</a>
            </p>
          </>
        ) : (
          <>
            <p class="hint">
              Feedback, questions, privacy requests, and security reports are welcome.
              {mailerConfigured ? (
                <>
                  {" "}
                  Use the form below, or email{" "}
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
                </>
              ) : (
                <>
                  {" "}
                  Email us at{" "}
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
                </>
              )}
            </p>
            {error && <p class="pin-error">{error}</p>}
            {mailerConfigured ? (
              <form method="post" action="/contact" class="home-form contact-form">
                {/* Bots that fill every field trip this; humans never see it. */}
                <div class="contact-honeypot" aria-hidden="true">
                  <label for="contact-company">Company</label>
                  <input
                    type="text"
                    id="contact-company"
                    name="company"
                    tabindex={-1}
                    autocomplete="off"
                  />
                </div>
                <label class="contact-label" for="contact-name">
                  Name <span class="muted">(optional)</span>
                </label>
                <input
                  type="text"
                  id="contact-name"
                  name="name"
                  value={name}
                  class="slug-input"
                  maxlength={100}
                  autocomplete="name"
                />
                <label class="contact-label" for="contact-email">
                  Email
                </label>
                <input
                  type="email"
                  id="contact-email"
                  name="email"
                  value={email}
                  class="slug-input"
                  required
                  maxlength={254}
                  autocomplete="email"
                />
                <label class="contact-label" for="contact-message">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  class="slug-input contact-message"
                  rows={8}
                  required
                  minlength={10}
                  maxlength={5000}
                  placeholder="How can we help?"
                >
                  {message}
                </textarea>
                <button type="submit" class="btn btn-primary">
                  Send message
                </button>
              </form>
            ) : null}
          </>
        )}
      </main>
      <SiteFooter />
    </Layout>
  );
}
