# Brevo Email 520 Error - Troubleshooting Guide

## Error Overview

**Error:** `Request failed with status code 520`
**Service:** Brevo (formerly Sendinblue)
**Type:** HTTP 520 - Web Server Returned Unknown Error (Cloudflare-specific)

This error indicates that Brevo's API, which is protected by Cloudflare, returned an unexpected response to your email sending request.

## What This Error Means

HTTP 520 is a Cloudflare error that occurs when:

- The origin server (Brevo) returned an empty response
- The origin server returned an unexpected response format
- The connection was interrupted before completion
- The server experienced an internal issue it couldn't properly communicate

## Common Causes

### 1. **Transient Service Issues** (Most Common)

- Temporary Brevo API degradation or outage
- Cloudflare CDN hiccups
- Network connectivity issues

### 2. **Rate Limiting**

- Exceeding Brevo's API rate limits
- Too many concurrent email requests
- Burst of traffic exceeding threshold

### 3. **Attachment Size Issues**

- PDF attachments that are too large (>10MB)
- Multiple tickets generating very large PDFs
- Base64 encoding increasing payload size

### 4. **Account-Level Issues**

- Daily or monthly sending quota reached
- Account suspended or limited
- Payment or billing issues

### 5. **API Configuration Problems**

- Expired or invalid API key
- Incorrect sender email configuration
- Missing domain verification

## Immediate Actions

### Step 1: Check Brevo Dashboard

1. Log into [Brevo Dashboard](https://app.brevo.com)
2. Navigate to **Statistics** → **Email Activity**
3. Check for:
   - Failed email attempts
   - Bounce rates
   - Current quota usage
4. Go to **Account** → **Plan**
   - Verify you haven't hit sending limits
   - Check account status

### Step 2: Verify API Configuration

```bash
# Check environment variables
echo $BREVO_API_KEY
echo $BREVO_SENDER_EMAIL
```

### Step 3: Check Brevo Status

- Visit [Brevo Status Page](https://status.brevo.com/)
- Check for ongoing incidents or maintenance

### Step 4: Review Recent Logs

Look for patterns:

- Does it happen at specific times?
- Does it happen with certain email types?
- Are there multiple failures in succession?

## Solutions Implemented

### 1. Retry Logic with Exponential Backoff ✅

The system now automatically retries failed email sends with smart retry logic:

- **Max Retries:** 3 attempts
- **Base Delay:** 1 second
- **Strategy:** Exponential backoff with jitter
- **Delay Pattern:** 1s → 2s (+random) → 4s (+random)

**What gets retried:**

- HTTP 520 errors
- HTTP 429 (rate limiting)
- HTTP 5xx (server errors)
- Connection timeouts/resets

**What doesn't get retried:**

- HTTP 4xx errors (except 429)
- Authentication failures
- Invalid request formats

### 2. Enhanced Error Logging ✅

Errors now include:

- HTTP status code
- Error code
- Response body details
- Number of retry attempts

### 3. Better Error Messages ✅

Console logs now clearly indicate:

- ✅ Success messages with details
- ⏳ Retry attempt notifications
- ❌ Final failure messages with debugging info

## Monitoring Best Practices

### Daily Monitoring

```bash
# Check for email errors in logs
grep "Error sending ticket confirmation email" /var/log/app.log

# Check for retry attempts
grep "Email send attempt" /var/log/app.log

# Check success rate
grep -c "✅ Ticket confirmation email sent" /var/log/app.log
```

### Weekly Tasks

- [ ] Review Brevo dashboard statistics
- [ ] Check bounce and spam complaint rates
- [ ] Verify sending quota usage
- [ ] Review failed email attempts

### Monthly Tasks

- [ ] Audit email delivery rates
- [ ] Review and optimize large PDF attachments
- [ ] Check domain authentication status (SPF, DKIM, DMARC)
- [ ] Update Brevo API key if needed

## Prevention Strategies

### 1. Optimize PDF Size

If sending many tickets, consider:

- Compressing images in PDFs
- Reducing QR code resolution (if unnecessarily high)
- Splitting very large batches into multiple emails

### 2. Implement Rate Limiting

- Add delay between bulk email sends
- Queue emails for processing
- Spread sends over time during high-traffic periods

### 3. Monitor Sending Patterns

- Track peak sending times
- Identify patterns before hitting limits
- Set up alerts for quota thresholds

### 4. Use Webhooks

Set up Brevo webhooks to receive:

- Delivery confirmations
- Bounce notifications
- Spam complaints
- Failed delivery attempts

## When to Escalate

Contact Brevo support if:

- Errors persist for > 30 minutes
- Error rate > 10% of attempts
- Multiple retry attempts all failing
- Status page shows no issues but errors continue
- Account unexpectedly limited or suspended

## Additional Resources

### Brevo Documentation

- [API Documentation](https://developers.brevo.com/)
- [Rate Limits](https://developers.brevo.com/docs/api-limits)
- [SMTP vs API](https://help.brevo.com/hc/en-us/articles/209467485)

### Status & Support

- [Brevo Status Page](https://status.brevo.com/)
- [Brevo Support](https://help.brevo.com/)
- [Contact Brevo Support](https://app.brevo.com/settings/support)

### Cloudflare Resources

- [Error 520 Documentation](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-520/)

## Technical Details

### Current Implementation

Location: `app/lib/email/ticket-notifications.ts`

```typescript
// Retry logic handles these errors:
(((-status ===
  520 - // Cloudflare error
    status) ===
  429 - // Rate limited
    status >=
    500 - // Server errors
      code) ===
  "ECONNRESET" - code) ===
  "ETIMEDOUT";
```

### Timeout Behavior

- **Retry Delays:** ~1s, ~2-3s, ~4-5s
- **Total Max Time:** ~10-15 seconds
- **After Max Retries:** Returns false, purchase still succeeds

### Graceful Degradation

The system is designed to:
✅ Complete purchases even if email fails
✅ Log failures for manual follow-up
✅ Not block user from receiving tickets
✅ Allow manual email resend via dashboard (future feature)

## FAQ

**Q: Will the user still get their tickets if email fails?**
A: Yes! The purchase completes successfully, tickets are generated and stored. The email is a notification mechanism. Users can always access tickets through their account page.

**Q: Should I be concerned about one-off 520 errors?**
A: Not really. Transient 520 errors happen occasionally with any third-party service. The retry logic should handle most cases. Only be concerned if you see patterns or persistent failures.

**Q: How do I know if we're hitting rate limits?**
A: Check Brevo dashboard for your plan's limits. Free plan: 300 emails/day. Paid plans vary. Look for HTTP 429 errors in logs, which specifically indicate rate limiting.

**Q: Can I increase the retry count?**
A: Yes, but be cautious. More retries mean longer delays for users. Current 3 retries (~10s total) is a good balance. Modify `maxRetries` parameter in `retryWithBackoff()`.

**Q: What if emails consistently fail to deliver?**
A: This might indicate a different issue (domain authentication, quota exceeded, account issue). Check the "Daily Monitoring" section and escalate to Brevo support.

---

**Last Updated:** October 29, 2025  
**Version:** 1.0  
**Related Files:**

- `app/lib/email/ticket-notifications.ts`
- `docs_guides/EMAIL_DELIVERABILITY.md`
