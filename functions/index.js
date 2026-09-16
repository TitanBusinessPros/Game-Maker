const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
// firebase-admin v14 dropped the old admin.firestore()/admin.initializeApp()
// namespace-style API in favor of these modular imports - the old form
// silently resolves admin.firestore to undefined instead of erroring at
// require time, which is what actually broke the first deploy attempt.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');

initializeApp();
const db = getFirestore();

// Set once via: firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
// (the "Signing secret" Stripe shows when you register this function's
// URL as a webhook endpoint in the Stripe Dashboard). Never committed to
// the repo - this is a real secret, unlike the public Firebase apiKey
// index.html/admin.html/play.html already embed.
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

// index.html's popup and this function both need to agree on what "buy
// more credits" actually grants - kept as one constant here rather than
// hardcoding "10" separately in two places that could drift apart.
const CREDITS_PER_PURCHASE = 10;

// This function only ever calls stripe.webhooks.constructEvent() (a
// local signature check against STRIPE_WEBHOOK_SECRET - no outbound
// Stripe API calls are made), which doesn't need a real secret API key,
// so the Stripe client below is constructed with a placeholder string
// on purpose. If this function ever needs to call the Stripe API for
// anything else, that would need a real key added as its own secret.
const STRIPE_KEY_PLACEHOLDER = 'sk_webhook_verification_only';

exports.stripeWebhook = onRequest({ secrets: [stripeWebhookSecret], cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const stripe = new Stripe(STRIPE_KEY_PLACEHOLDER);

  // Signature verification is the entire security boundary here - it's
  // what stops anyone from just POSTing a fake "payment succeeded" body
  // at this URL to grant themselves free credits. Needs the RAW request
  // body (req.rawBody), which Firebase Functions preserves specifically
  // for this - a body already parsed to JSON and re-serialized would no
  // longer match the signature Stripe computed over the original bytes.
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], stripeWebhookSecret.value());
  } catch (err) {
    logger.error('Webhook signature verification failed', { message: err.message });
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // checkout.session.completed covers instant payment methods (cards) -
  // payment_status is already 'paid' by the time this fires. Some
  // payment methods (bank debits, certain buy-now-pay-later options)
  // don't confirm instantly: completed fires first with payment_status
  // 'unpaid', and the actual paid confirmation arrives later as this
  // second, separate event instead. Both land here and are handled
  // identically from this point on - whichever one actually represents
  // "money has cleared" for a given payment method.
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    res.status(200).send('ignored'); // ack so Stripe doesn't retry - just not an event this function acts on
    return;
  }

  const session = event.data.object;
  if (session.payment_status !== 'paid') {
    // Normal for a fresh checkout.session.completed on a delayed payment
    // method - not an error, just not payable yet. The
    // async_payment_succeeded event for this same session will arrive
    // once it actually clears and grant credits then.
    res.status(200).send('not paid yet');
    return;
  }

  // index.html appends ?client_reference_id=<firebase-uid> to the
  // payment link when it shows the popup - this is the only thing that
  // ties a Stripe purchase back to a specific Firebase account, since a
  // plain buy.stripe.com link is otherwise identical for every buyer.
  const uid = session.client_reference_id;
  if (!uid) {
    logger.error('checkout.session.completed with no client_reference_id - cannot tell which account to credit', { sessionId: session.id });
    res.status(200).send('no client_reference_id'); // ack (stops retries) - needs manual follow-up, not an automatic retry loop
    return;
  }

  // Idempotency: Stripe redelivers events it didn't get a fast 2xx for,
  // and can occasionally deliver the same completed session more than
  // once even without an error - without this, a retry would grant 10
  // credits twice for one $5 payment. Keyed by the Checkout Session id
  // (stable per purchase), not the event id (a redelivery of the same
  // event gets its own new event id).
  const processedRef = db.collection('processedStripeSessions').doc(session.id);
  const granted = await db.runTransaction(async (tx) => {
    const existing = await tx.get(processedRef);
    if (existing.exists) return false;
    tx.set(processedRef, {
      uid,
      amountTotal: session.amount_total,
      currency: session.currency,
      processedAt: FieldValue.serverTimestamp(),
    });
    // merge:true + increment also handles the (unlikely) case where this
    // account's own credits doc doesn't exist yet - it creates one
    // rather than failing outright.
    tx.set(db.collection('users').doc(uid), { credits: FieldValue.increment(CREDITS_PER_PURCHASE) }, { merge: true });
    return true;
  });

  logger.info(granted
    ? `Granted ${CREDITS_PER_PURCHASE} credits to uid ${uid} for session ${session.id}`
    : `Session ${session.id} already processed - skipped duplicate delivery`);
  res.status(200).send('ok');
});
