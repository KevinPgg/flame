# DNS Configuration for Email Deliverability

This guide provides step-by-step instructions for configuring DNS records to ensure your FLAME Events emails are delivered successfully and not marked as spam.

## 🚨 Critical: These DNS records are REQUIRED

Without proper DNS configuration, your emails **will likely be marked as spam** or blocked entirely by email providers.

## 1. SPF (Sender Policy Framework) Record

**What it does**: Prevents domain spoofing by specifying which servers can send emails on behalf of your domain.

**DNS Record Type**: TXT  
**Host/Name**: @ (root domain) or your domain name  
**Value**: `v=spf1 include:spf.brevo.com ~all`

### Examples by DNS Provider:

#### Cloudflare

1. Log into Cloudflare dashboard
2. Select your domain
3. Go to DNS > Records
4. Click "Add record"
5. Type: TXT
6. Name: @ (or your domain)
7. Content: `v=spf1 include:spf.brevo.com ~all`
8. Click "Save"

#### GoDaddy

1. Log into GoDaddy account
2. Go to My Products > DNS
3. Click "Add" under Records
4. Type: TXT
5. Host: @
6. TXT Value: `v=spf1 include:spf.brevo.com ~all`
7. Click "Save"

#### Namecheap

1. Log into Namecheap account
2. Go to Domain List > Manage
3. Advanced DNS tab
4. Add New Record
5. Type: TXT Record
6. Host: @
7. Value: `v=spf1 include:spf.brevo.com ~all`
8. Click "Save"

## 2. DKIM (DomainKeys Identified Mail) Record

**What it does**: Cryptographically signs your emails to verify they haven't been tampered with.

### Setup Steps:

1. **Log into your Brevo account**
2. **Go to Settings > Senders & IP**
3. **Click "Add a domain"**
4. **Enter your domain name**
5. **Follow the DKIM setup instructions provided by Brevo**
6. **Copy the DKIM record details**
7. **Add the DKIM record to your DNS**

The DKIM record will look something like:

- **Type**: TXT
- **Host**: `mail._domainkey` (or similar, as provided by Brevo)
- **Value**: A long string starting with `v=DKIM1;` (provided by Brevo)

## 3. DMARC (Domain-based Message Authentication) Record

**What it does**: Provides policy instructions for what to do with emails that fail SPF or DKIM checks.

**DNS Record Type**: TXT  
**Host/Name**: `_dmarc` (creates `_dmarc.yourdomain.com`)  
**Value**: `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; ruf=mailto:dmarc@yourdomain.com; fo=1`

### DMARC Policy Options:

- `p=none` - Monitor only (recommended for testing)
- `p=quarantine` - Send suspicious emails to spam folder (recommended for production)
- `p=reject` - Reject suspicious emails entirely (use with caution)

## 4. Verification Steps

After adding all DNS records:

1. **Wait 24-48 hours** for DNS propagation
2. **Verify SPF**: Use [MXToolbox SPF Checker](https://mxtoolbox.com/spf.aspx)
3. **Verify DKIM**: Check in Brevo dashboard under Settings > Senders & IP
4. **Verify DMARC**: Use [DMARC Analyzer](https://www.dmarcanalyzer.com/)
5. **Test email delivery**: Send test emails to Gmail, Outlook, and Yahoo

## 5. Common DNS Providers Quick Links

| Provider       | DNS Management URL                        |
| -------------- | ----------------------------------------- |
| Cloudflare     | https://dash.cloudflare.com               |
| GoDaddy        | https://dcc.godaddy.com/manage/dns        |
| Namecheap      | https://ap.www.namecheap.com/domains/list |
| Google Domains | https://domains.google.com                |
| AWS Route 53   | https://console.aws.amazon.com/route53    |

## 6. Troubleshooting

### SPF Issues

- Ensure only one SPF record exists per domain
- Check for syntax errors (spaces, typos)
- Verify the record includes `include:spf.brevo.com`

### DKIM Issues

- Verify the DKIM record was copied exactly from Brevo
- Check that the subdomain (`mail._domainkey`) is correct
- Wait for DNS propagation (up to 48 hours)

### DMARC Issues

- Ensure the record is on the `_dmarc` subdomain
- Start with `p=none` for testing
- Update email addresses to real addresses you monitor

## 7. Testing Tools

- **SPF**: https://www.mail-tester.com/spf/
- **DKIM**: https://www.mail-tester.com/dkim/
- **DMARC**: https://www.mail-tester.com/dmarc/
- **Overall**: https://www.mail-tester.com/ (comprehensive test)

## 8. Need Help?

If you encounter issues:

1. Check the [EMAIL_DELIVERABILITY.md](./EMAIL_DELIVERABILITY.md) guide
2. Contact your DNS provider's support
3. Reach out to Brevo support through their dashboard
4. Use the testing tools above to identify specific issues

---

**⚠️ Important**: These DNS changes are critical for email deliverability. Without them, your emails will likely be marked as spam or blocked entirely.
