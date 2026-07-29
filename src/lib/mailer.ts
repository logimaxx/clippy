const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface Mail {
  to: string;
  subject: string;
  text: string;
}

function apiKey(): string | undefined {
  return process.env.RESEND_API_KEY || undefined;
}

function fromAddress(): string | undefined {
  return process.env.MAIL_FROM || undefined;
}

/** Transactional email is optional — flows that need it stay hidden when unset. */
export function isMailerConfigured(): boolean {
  return !!apiKey() && !!fromAddress();
}

let lastFailureAt = 0;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Whether delivery broke recently. Flows that must not reveal whether an
 * address has an account use this instead of a per-send result: it is the same
 * answer for every visitor, so it leaks nothing while still explaining why no
 * email arrived.
 */
export function mailerRecentlyFailed(): boolean {
  return Date.now() - lastFailureAt < FAILURE_WINDOW_MS;
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const key = apiKey();
  const from = fromAddress();
  if (!key || !from) return false;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Never log the body: it echoes the recipient address.
      console.error(`Email send failed with status ${res.status}`);
      lastFailureAt = Date.now();
      return false;
    }
    lastFailureAt = 0;
    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    lastFailureAt = Date.now();
    return false;
  }
}
