update organizations
set stripe_account_id = null, stripe_charges_enabled = false, stripe_payouts_enabled = false
where slug = 'peluchin';