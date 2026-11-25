/**
 * Shared token check for zeffy-webhook.
 * The header x-zeffy-token or the query parameter token may carry the secret.
 * Either value that matches ZEFFY_WEBHOOK_TOKEN is accepted.
 */

const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * @param {string | undefined | null} expected ZEFFY_WEBHOOK_TOKEN
 * @param {string | undefined | null} headerToken x-zeffy-token
 * @param {string | undefined | null} queryToken url token query parameter
 * @returns {{ status: number, error: string | null }}
 */
export const webhookAccess = (expected, headerToken, queryToken) => {
  const secret = trimmed(expected);
  if (!secret) {
    return { status: 500, error: "Webhook token is not configured" };
  }
  const header = trimmed(headerToken);
  const query = trimmed(queryToken);
  if ((header && header === secret) || (query && query === secret)) {
    return { status: 200, error: null };
  }
  return { status: 401, error: "Unauthorized" };
};
