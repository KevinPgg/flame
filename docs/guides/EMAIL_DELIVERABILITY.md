# Email Deliverability Guide for FLAME Events

This guide provides comprehensive instructions to ensure your FLAME Events emails are delivered successfully and not marked as spam.

## 🚀 Quick Setup Checklist

### 1. DNS Configuration (Critical)

To prevent your emails from being marked as spam, you **must** configure these DNS records for your domain:

#### SPF Record

Add this TXT record to your domain's DNS:

```
v=spf1 include:spf.brevo.com ~all
```

#### DKIM Record

1. Log into your Brevo account
2. Go to Settings > Senders & IP
3. Add your domain and follow the DKIM setup instructions
4. Add the provided DKIM TXT record to your DNS

#### DMARC Record

Add this TXT record to `_dmarc.yourdomain.com`:

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; ruf=mailto:dmarc@yourdomain.com; fo=1
```

### 2. Environment Variables

Ensure these environment variables are properly set:

```bash
# Required
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@yourdomain.com  # Must match your verified domain
FROM_EMAIL=noreply@yourdomain.com          # Must match your verified domain
SUPPORT_EMAIL=support@yourdomain.com

# Optional but recommended
UNSUBSCRIBE_EMAIL=unsubscribe@yourdomain.com
```

### 3. Domain Verification

1. **Verify your sending domain** in Brevo dashboard
2. **Use a professional domain** (avoid gmail.com, yahoo.com, etc.)
3. **Use consistent sender names** across all emails

## 📧 Email Best Practices

### Subject Lines

- ✅ Keep under 50 characters
- ✅ Be specific and relevant
- ✅ Avoid ALL CAPS
- ❌ Don't use excessive punctuation (!!!)
- ❌ Avoid spam trigger words (FREE, URGENT, etc.)

### Content Guidelines

- ✅ Use proper HTML structure
- ✅ Include both HTML and plain text versions
- ✅ Maintain good text-to-image ratio
- ✅ Use legitimate business language
- ❌ Avoid excessive use of images
- ❌ Don't use misleading content

### Technical Implementation

- ✅ Set proper email headers (already implemented)
- ✅ Include unsubscribe links (already implemented)
- ✅ Use consistent sender information
- ✅ Implement proper error handling

## 🔧 Current Implementation

The FLAME Events platform already includes several deliverability improvements:

### Email Headers

All emails now include:

- `X-Priority`: Set to "1" for important emails (tickets), "2" for normal emails
- `X-MSMail-Priority`: Microsoft-specific priority header
- `Importance`: Standard importance header
- `X-Mailer`: Identifies the sending platform
- `X-Auto-Response-Suppress`: Prevents auto-replies
- `List-Unsubscribe`: Required for compliance
- `List-Unsubscribe-Post`: One-click unsubscribe support

### Email Types and Priorities

1. **Ticket Confirmation Emails** - High Priority (X-Priority: 1)

   - Most important emails containing purchased tickets
   - Include PDF attachments with QR codes
   - Clear, transactional content
   - **Features:**
     - Emoji-enhanced event details (📅 Date, 📍 Venue, 🎟️ Ticket Type, 👥 Quantity)
     - Order information (💰 Total Paid, 📋 Order ID)
     - "What's Next?" section with clear instructions
     - "My Account" button for easy access to tickets
     - Important event entry information

2. **RSVP Approval Emails** - High Priority (X-Priority: 1)

   - Time-sensitive purchase completion links or ticket access
   - Clear call-to-action
   - **Format:** Matches ticket confirmation email style for consistency
   - **Features:**
     - Header: "🎫 Your Tickets Are Ready!" with personalized greeting
     - RSVP-specific message: "Great news! Your RSVP for [Event] has been approved by [Organization]"
     - Emoji-enhanced event details (📅 Date, 📍 Venue, 🎟️ Ticket Type, 👥 Quantity)
     - Complete pricing breakdown:
       - Ticket price (base price)
       - + Service fee
       - 💰 Total Paid (prominent display)
     - 📋 Order ID for tracking
     - Dynamic "What's Next?" section:
       - For paid RSVPs: Purchase button with instructions
       - For approved RSVPs with tickets: Account access with "Your Tickets" summary
     - "My Account" button (shown when tickets are ready)
     - "⚠️ Important Information" section with entry requirements
     - **No PDF attachment** (users access tickets via account)
     - Dynamic URLs using `getBaseUrl()` utility for environment consistency

3. **RSVP Rejection Emails** - Normal Priority (X-Priority: 2)

   - Informational updates
   - Polite, professional tone

4. **Contact Form Emails** - Normal Priority (X-Priority: 2)
   - Internal notifications
   - Include sender information for replies

## 🛡️ Spam Prevention Strategies

### 1. Authentication Setup

- **SPF**: Prevents domain spoofing
- **DKIM**: Cryptographically signs emails
- **DMARC**: Provides policy for failed authentication

### 2. Reputation Management

- **Monitor bounce rates**: Keep under 2%
- **Track spam complaints**: Keep under 0.1%
- **Maintain engagement**: Monitor open/click rates
- **Clean email lists**: Remove inactive subscribers

### 3. Content Optimization

- **Personalization**: Use recipient names
- **Relevant content**: Match user expectations
- **Clear branding**: Consistent visual identity
- **Professional design**: Clean, modern templates

## 📊 Monitoring and Maintenance

### Key Metrics to Track

1. **Delivery Rate**: Should be >95%
2. **Open Rate**: Industry average 15-25%
3. **Click Rate**: Industry average 2-5%
4. **Bounce Rate**: Should be <2%
5. **Spam Complaint Rate**: Should be <0.1%

### Regular Tasks

- [ ] Weekly: Review email performance metrics
- [ ] Monthly: Check DNS record status
- [ ] Monthly: Review and update email templates
- [ ] Quarterly: Audit email list quality
- [ ] Quarterly: Review and update unsubscribe processes

## 🚨 Troubleshooting Common Issues

### Emails Going to Spam

1. Check DNS records (SPF, DKIM, DMARC)
2. Verify domain authentication in Brevo
3. Review email content for spam triggers
4. Check sender reputation
5. Ensure consistent sender information

### Low Delivery Rates

1. Clean email list of bounces
2. Implement double opt-in for new subscribers
3. Monitor and reduce spam complaints
4. Use proper email authentication

### High Bounce Rates

1. Validate email addresses before sending
2. Remove hard bounces immediately
3. Monitor soft bounces and remove after multiple failures
4. Use email validation services

## 📞 Support and Resources

### Brevo Resources

- [Brevo Deliverability Guide](https://help.brevo.com/hc/en-us/articles/209467485)
- [Authentication Setup](https://help.brevo.com/hc/en-us/articles/209467485)
- [Best Practices](https://help.brevo.com/hc/en-us/articles/360000991960)

### Testing Tools

- [Mail Tester](https://www.mail-tester.com/) - Test spam score
- [MXToolbox](https://mxtoolbox.com/) - DNS record checker
- [DMARC Analyzer](https://www.dmarcanalyzer.com/) - DMARC monitoring

### Emergency Contacts

- Brevo Support: Available through dashboard
- DNS Provider: Contact your domain registrar
- Development Team: Check internal documentation

---

**Last Updated**: $(date)
**Version**: 1.0
**Maintained by**: FLAME Events Development Team
