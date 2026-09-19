const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
// firebase-admin v14 dropped the old admin.firestore()/admin.initializeApp()
// namespace-style API in favor of these modular imports - the old form
// silently resolves admin.firestore to undefined instead of erroring at
// require time, which is what actually broke the first deploy attempt.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const Stripe = require('stripe');

initializeApp();
const db = getFirestore();

// Duplicated from index.html/admin.html's own ADMIN_EMAIL - this is the
// actual security boundary for grantCredits below (checked off the
// caller's own verified ID token, same as every other admin-only action
// in this project), not just a client-side check.
const ADMIN_EMAIL = 'adonai4you@gmail.com';

// Set once via: firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
// (the "Signing secret" Stripe shows when you register this function's
// URL as a webhook endpoint in the Stripe Dashboard). Never committed to
// the repo - this is a real secret, unlike the public Firebase apiKey
// index.html/admin.html/play.html already embed.
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

// index.html's buy-credits popup offers two fixed Stripe Payment Links
// (same URL for every buyer, no dynamically created Checkout Session -
// see showBuyCreditsPopup) - this is how the webhook tells which one a
// given payment actually was, since a Payment Link's own Checkout
// Session doesn't otherwise carry a product/plan id this function reads
// without an extra Stripe API call to expand line_items (and this
// function deliberately never calls the real Stripe API - see
// STRIPE_KEY_PLACEHOLDER below). `amountTotal` is in the currency's
// smallest unit (cents for USD), matching `session.amount_total`
// exactly as Stripe reports it. Keep this in sync with index.html's own
// STRIPE_BUY_CREDITS_LINK/STRIPE_BUY_50_CREDITS_LINK (and their prices
// in the Stripe Dashboard) if either bundle's price or credit count
// ever changes.
const CREDIT_PACKAGES = [
  { amountTotal: 500, credits: 10 },  // $5 -> 10 credits
  { amountTotal: 2000, credits: 50 }, // $20 -> 50 credits
];

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

  // Which bundle this actually was - if the amount doesn't match either
  // known package (a price changed in the Stripe Dashboard without this
  // list being updated to match, or a payment that didn't come through
  // one of these two links at all), this deliberately does NOT guess: no
  // credits are granted automatically rather than risking granting the
  // wrong amount for real money paid, and it's logged for manual
  // follow-up instead.
  const pkg = CREDIT_PACKAGES.find((p) => p.amountTotal === session.amount_total);
  if (!pkg) {
    logger.error('checkout.session.completed with an amount that matches no known credit package - needs manual review, no credits granted automatically', {
      sessionId: session.id, uid, amountTotal: session.amount_total, currency: session.currency,
    });
    res.status(200).send('unrecognized amount'); // ack (stops retries) - needs manual follow-up
    return;
  }

  // Idempotency: Stripe redelivers events it didn't get a fast 2xx for,
  // and can occasionally deliver the same completed session more than
  // once even without an error - without this, a retry would grant
  // credits twice for one payment. Keyed by the Checkout Session id
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
      creditsGranted: pkg.credits,
      processedAt: FieldValue.serverTimestamp(),
    });
    // merge:true + increment also handles the (unlikely) case where this
    // account's own credits doc doesn't exist yet - it creates one
    // rather than failing outright.
    tx.set(db.collection('users').doc(uid), { credits: FieldValue.increment(pkg.credits) }, { merge: true });
    return true;
  });

  logger.info(granted
    ? `Granted ${pkg.credits} credits to uid ${uid} for session ${session.id} ($${(session.amount_total / 100).toFixed(2)})`
    : `Session ${session.id} already processed - skipped duplicate delivery`);
  res.status(200).send('ok');
});

// admin.html's "Grant download credits" action. This is the only other
// place (besides the Stripe webhook above) allowed to *increase* a
// /users/{uid} credits balance - firestore.rules' own update rule only
// ever allows that field to go down, by design, since there's no backend
// to trust a client's own claimed balance otherwise. Being a Cloud
// Function running under the Admin SDK is what makes the increase
// possible at all; it bypasses those rules the same way the webhook does.
//
// Handles both cases the admin asked for:
//  - The email already has a Firebase Auth account (they've signed into
//    index.html/admin.html/producer.html at least once, whether or not
//    they've since spent any of their starting credits) - looked up via
//    getUserByEmail, then its /users/{uid} doc is incremented (or created,
//    for the rare case where that never happened) directly.
//  - The email has never signed in at all - there's no uid and so no
//    /users/{uid} doc to credit yet. The grant is queued instead, in a new
//    pendingCreditGrants/{email} doc, and index.html's own
//    ensureUserCreditsDoc() folds it into that account's very first
//    balance (on top of the usual 3, or 50 if the email's also on the
//    bonusEmails list) the moment they do sign in - see the matching
//    change to firestore.rules' /users/{uid} create rule and to
//    ensureUserCreditsDoc itself.
exports.grantCredits = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.email !== ADMIN_EMAIL || !auth.token.email_verified) {
    throw new HttpsError('permission-denied', 'Only the admin account can grant credits.');
  }

  const email = String(request.data?.email || '').trim().toLowerCase();
  const amount = Number(request.data?.amount);
  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
    throw new HttpsError('invalid-argument', 'Amount must be a whole number between 1 and 1000.');
  }

  let uid = null;
  try {
    uid = (await getAuth().getUserByEmail(email)).uid;
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
  }

  if (uid) {
    await db.collection('users').doc(uid).set(
      { email, credits: FieldValue.increment(amount) },
      { merge: true }
    );
    logger.info(`Granted ${amount} credits to existing account ${email} (uid ${uid})`);
    return { status: 'credited', amount };
  }

  // merge + increment also handles this being the first grant queued for
  // this email (increment on a field that doesn't exist yet starts from 0).
  await db.collection('pendingCreditGrants').doc(email).set(
    { email, amount: FieldValue.increment(amount) },
    { merge: true }
  );
  logger.info(`Queued ${amount} pending credits for ${email} (no account yet)`);
  return { status: 'pending', amount };
});

// index.html's Premium Library - a second, separate shared asset library
// (Firestore `premiumLibraryItems`, Storage `premium-library/<category>/...`,
// mirroring `libraryItems`/`library/...` exactly) where every item starts
// LOCKED for every account and costs exactly one download credit to
// unlock, permanently, per (account, item) pair - "one credit equals one
// item unlocked... once unlocked it is unlocked forever." Spends from the
// same /users/{uid} credits balance downloads already use - the
// map-maker's own choice, one balance rather than a second currency.
//
// This has to run under the Admin SDK for the same reason grantCredits
// does: firestore.rules already safely lets a client decrease its OWN
// credits balance directly with no Cloud Function needed (see that
// file's own /users/{uid} update rule) - but there'd be no way to trust
// a client-side write of the *unlock record itself* (proving a specific
// item was actually paid for) without some server-side check tying the
// two together, so this function does both the decrement and the unlock
// record in one atomic transaction instead. firestore.rules denies every
// client write to `premiumUnlocks` outright - this function is the only
// writer, the same "increase/record only via the Admin SDK" shape
// grantCredits and the Stripe webhook above already use.
exports.unlockPremiumItem = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const itemId = String(request.data?.itemId || '').trim();
  if (!itemId) throw new HttpsError('invalid-argument', 'Missing itemId.');

  const uid = auth.uid;
  // The admin account is exempt from spending credits here too, same
  // treatment index.html's download-credit system already gives it
  // (unlimited, no balance to check) - it still gets a real unlock
  // record though, so admin.html/index.html's own UI reads "already
  // unlocked" consistently afterward instead of prompting to spend a
  // credit the admin was never going to be charged anyway.
  const isAdmin = auth.token.email === ADMIN_EMAIL;
  const itemRef = db.collection('premiumLibraryItems').doc(itemId);
  const unlockRef = db.collection('premiumUnlocks').doc(`${uid}_${itemId}`);
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx) => {
    const [itemSnap, unlockSnap, userSnap] = await Promise.all([tx.get(itemRef), tx.get(unlockRef), tx.get(userRef)]);
    if (!itemSnap.exists) throw new HttpsError('not-found', 'This item no longer exists.');
    // Already unlocked (e.g. a retried call after a flaky connection, or
    // just clicking an already-unlocked item again) - idempotent, never
    // charge twice for the same item.
    if (unlockSnap.exists) return { status: 'already-unlocked', credits: isAdmin ? null : (userSnap.data()?.credits ?? 0) };

    const credits = userSnap.data()?.credits ?? 0;
    if (!isAdmin && credits < 1) throw new HttpsError('failed-precondition', 'Not enough credits.');

    tx.set(unlockRef, { uid, itemId, category: itemSnap.data().category, unlockedAt: FieldValue.serverTimestamp() });
    if (!isAdmin) tx.set(userRef, { credits: FieldValue.increment(-1) }, { merge: true });
    return { status: 'unlocked', credits: isAdmin ? null : credits - 1 };
  });
});
