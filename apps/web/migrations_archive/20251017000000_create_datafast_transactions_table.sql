-- Create datafast_transactions table for comprehensive transaction tracking
-- Per Datafast guide recommendation (Section 3.2, line 747):
-- "se recomienda que se guarde esta información ya sea en una transacción exitosa como en una fallida"
-- (it is recommended to save this information whether in a successful or failed transaction)

CREATE TABLE IF NOT EXISTS datafast_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Transaction identification
  datafast_checkout_id TEXT, -- The checkoutId from Datafast (step 1)
  datafast_transaction_id TEXT, -- The final transaction ID from Datafast (step 3)
  merchant_transaction_id TEXT NOT NULL, -- Our unique transaction ID
  
  -- Transaction status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, processed, failed, timeout
  transaction_type TEXT NOT NULL, -- checkout_created, payment_verified, payment_failed
  
  -- Datafast response codes
  result_code TEXT, -- e.g., "000.100.112", "800.100.155"
  result_description TEXT,
  
  -- Payment details
  amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',
  payment_type TEXT DEFAULT 'DB', -- DB (debit/purchase)
  payment_brand TEXT, -- VISA, MASTER, etc.
  
  -- Transaction details from Datafast
  auth_code TEXT, -- resultDetails.AuthCode
  reference_no TEXT, -- resultDetails.ReferenceNo
  batch_no TEXT, -- resultDetails.BatchNo
  acquirer_code TEXT, -- resultDetails.AcquirerCode (01=Pacificard, 02=Diners, etc.)
  card_type TEXT, -- resultDetails.CardType (MP, VG, etc.)
  acquirer_response TEXT, -- resultDetails.AcquirerResponse
  extended_description TEXT, -- resultDetails.ExtendedDescription
  clearing_institute_name TEXT, -- resultDetails.clearingInstituteName
  
  -- Card information (masked)
  card_bin TEXT, -- First 6 digits
  card_last4 TEXT, -- Last 4 digits
  card_holder TEXT,
  card_expiry_month TEXT,
  card_expiry_year TEXT,
  card_bin_country TEXT,
  
  -- Customer information (for reconciliation)
  user_id UUID REFERENCES users(id),
  customer_email TEXT,
  customer_ip TEXT,
  
  -- Risk and fraud data
  risk_score TEXT,
  risk_status_code TEXT,
  risk_fraud_status_code TEXT,
  
  -- Order linkage
  order_id UUID REFERENCES orders(id),
  hold_id UUID, -- For hold-based purchases
  
  -- Complete JSON responses (for debugging and auditing)
  checkout_request_data JSONB, -- What we sent to create checkout
  checkout_response_data JSONB, -- What Datafast returned (step 1)
  verification_request_data JSONB, -- What we sent to verify
  verification_response_data JSONB, -- What Datafast returned (step 3)
  
  -- Error tracking
  error_code TEXT,
  error_message TEXT,
  error_details JSONB,
  
  -- Timestamps
  checkout_created_at TIMESTAMPTZ, -- When checkout was created
  payment_attempted_at TIMESTAMPTZ, -- When user clicked "Pay"
  verified_at TIMESTAMPTZ, -- When we verified the transaction
  processed_at TIMESTAMPTZ, -- When we marked it as processed in our system
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_datafast_transactions_checkout_id ON datafast_transactions(datafast_checkout_id);
CREATE INDEX idx_datafast_transactions_transaction_id ON datafast_transactions(datafast_transaction_id);
CREATE INDEX idx_datafast_transactions_merchant_id ON datafast_transactions(merchant_transaction_id);
CREATE INDEX idx_datafast_transactions_status ON datafast_transactions(status);
CREATE INDEX idx_datafast_transactions_user_id ON datafast_transactions(user_id);
CREATE INDEX idx_datafast_transactions_order_id ON datafast_transactions(order_id);
CREATE INDEX idx_datafast_transactions_result_code ON datafast_transactions(result_code);
CREATE INDEX idx_datafast_transactions_created_at ON datafast_transactions(created_at);

-- Index for transaction verifier queries (Section 10 of guide)
CREATE INDEX idx_datafast_transactions_unprocessed ON datafast_transactions(status) 
  WHERE status IN ('pending', 'processing');

-- Enable Row Level Security
ALTER TABLE datafast_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own transactions
CREATE POLICY "Users can view own transactions"
  ON datafast_transactions
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_id = auth.uid()::TEXT
    )
  );

-- Policy: Service role can do everything (for API routes)
CREATE POLICY "Service role has full access"
  ON datafast_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_datafast_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
CREATE TRIGGER set_datafast_transactions_updated_at
  BEFORE UPDATE ON datafast_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_datafast_transactions_updated_at();

-- Comments for documentation
COMMENT ON TABLE datafast_transactions IS 'Comprehensive transaction log for all Datafast payment attempts (successful and failed). Per Datafast guide recommendation for auditing and transaction verification.';
COMMENT ON COLUMN datafast_transactions.status IS 'Transaction status: pending (checkout created), processing (payment form submitted), processed (verified and order completed), failed (payment rejected), timeout (verification failed)';
COMMENT ON COLUMN datafast_transactions.result_code IS 'Datafast result code (see guide section 4.2). 000.100.112=Phase 2 success, 000.000.000=Production success';
COMMENT ON COLUMN datafast_transactions.merchant_transaction_id IS 'Our unique transaction ID (must be unique per transaction, even if rejected)';
COMMENT ON COLUMN datafast_transactions.verification_response_data IS 'Full JSON response from Datafast verification endpoint (for Figure 12 data)';

