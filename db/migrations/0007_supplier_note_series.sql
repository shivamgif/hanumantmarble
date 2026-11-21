-- A supplier debit note is our own claim on a purchase, not a GST document
-- (the supplier issues that), so it numbers in its own series ('HMPD/…'),
-- apart from the customer debit notes that GSTR-1 counts ('HMD/…').
ALTER TABLE acc_notes DROP CONSTRAINT acc_notes_business_id_kind_fiscal_year_seq_key;
ALTER TABLE acc_notes ADD CONSTRAINT acc_notes_business_id_kind_party_kind_fiscal_year_seq_key
  UNIQUE (business_id, kind, party_kind, fiscal_year, seq);
-- Only these pairings exist: a credit note to a supplier is theirs to issue.
ALTER TABLE acc_notes ADD CONSTRAINT acc_notes_kind_party_check CHECK (kind = 'debit' OR party_kind = 'customer');
