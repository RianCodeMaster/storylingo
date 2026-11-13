/**
 * Who is behind Qissio, for the terms and the privacy policy (app/[edition]/terms, privacy). Fill in the real
 * details before taking payments live: the law asks for them, and Stripe checks that they are there.
 */
export const COMPANY = {
  name: "[bedrijfsnaam]", // the name as registered at the KvK
  kvk: "[KvK-nummer]",
  vat: "[btw-nummer]", // the btw-id (NL…B01); "" leaves it out of the texts
  address: "[adres, postcode, plaats]",
  email: "info@qissio.com",
  country: "Nederland",
};

/** The date shown at the top of both texts; change it whenever a text changes. */
export const LEGAL_UPDATED = "2026-11-14";
