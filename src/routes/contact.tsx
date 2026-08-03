/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { canRequestContact } from "../lib/auth-throttle";
import { contactEmail } from "../lib/contact";
import { isMailerConfigured, sendMail } from "../lib/mailer";
import { ContactPage, type ContactFormValues } from "../views/Contact";

const contact = new Hono();

const NAME_MAX = 100;
const EMAIL_MAX = 254;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;

function page(
  props: {
    sent?: boolean;
    error?: string;
    values?: ContactFormValues;
  } = {},
  status = 200
) {
  return {
    status,
    element: (
      <ContactPage
        sent={props.sent}
        error={props.error}
        values={props.values}
        mailerConfigured={isMailerConfigured()}
        contactEmail={contactEmail()}
      />
    ),
  };
}

contact.get("/contact", (c) => {
  const { element } = page();
  return c.html(element);
});

contact.post("/contact", async (c) => {
  if (!isMailerConfigured()) {
    const { element, status } = page(
      {
        error:
          "The contact form is temporarily unavailable. Please email us directly.",
      },
      503
    );
    return c.html(element, status);
  }

  const body = await c.req.parseBody();
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, NAME_MAX) : "";
  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase().slice(0, EMAIL_MAX)
      : "";
  const message =
    typeof body.message === "string"
      ? body.message.trim().slice(0, MESSAGE_MAX)
      : "";
  const values: ContactFormValues = { name, email, message };

  // Honeypot filled → pretend success so bots don't learn anything useful.
  if (company) {
    const { element } = page({ sent: true });
    return c.html(element);
  }

  if (!email.includes("@") || email.length < 3) {
    const { element, status } = page(
      { error: "Enter a valid email address so we can reply.", values },
      400
    );
    return c.html(element, status);
  }

  if (message.length < MESSAGE_MIN) {
    const { element, status } = page(
      {
        error: `Please write a short message (at least ${MESSAGE_MIN} characters).`,
        values,
      },
      400
    );
    return c.html(element, status);
  }

  if (!canRequestContact(c.req.raw.headers)) {
    const { element, status } = page(
      {
        error: "Too many messages from this network. Try again later.",
        values,
      },
      429
    );
    return c.html(element, status);
  }

  const fromLabel = name || "Anonymous";
  const ok = await sendMail({
    to: contactEmail(),
    replyTo: email,
    subject: `Webklip contact from ${fromLabel}`,
    text: [
      `From: ${fromLabel} <${email}>`,
      "",
      message,
      "",
      "---",
      "Sent via the Webklip contact form.",
    ].join("\n"),
  });

  if (!ok) {
    const { element, status } = page(
      {
        error:
          "We couldn't send your message right now. Please try again in a few minutes, or email us directly.",
        values,
      },
      502
    );
    return c.html(element, status);
  }

  const { element } = page({ sent: true });
  return c.html(element);
});

export { contact };
