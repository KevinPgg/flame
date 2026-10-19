# DEPRECATED: Datafast JSON Field Mapping Verification

> **⚠️ DEPRECATED**: This document is a historical reference for the legacy Datafast integration, which has been replaced by Stripe Connect. See [Payment Systems Evolution](../PAYMENT_SYSTEMS_EVOLUTION.md) for details.

## Overview

This document verifies that the test script is filled with the correct data from the JSON response as required by Datafast.

## Datafast's Requirement

**From Datafast Guide:**

> "Nota: El script debe ser llenado con los datos que responde el botón en formato json, el número de lote y referencia se obtiene del campo ReferenceNbr, el cual está detallado en la guía de implementación."

Translation: "The script must be filled with the data that the button responds with in JSON format, the batch number and reference are obtained from the ReferenceNbr field, which is detailed in the implementation guide."

## JSON Response Structure

From a successful transaction, the relevant fields are:

```json
{
  "id": "8ac7a4a199ff8eb2019a032fa3a15b88",
  "amount": "28.00",
  "currency": "USD",
  "paymentType": "DB",
  "paymentBrand": "VISA",
  "resultDetails": {
    "AuthCode": "661777",
    "BatchNo": "251020",
    "ReferenceNo": "000083",
    "ReferenceNbr": "251020_000083",    ← KEY FIELD
    "TotalAmount": "28.00",
    "AcquirerCode": "01",
    "CardType": "MP",
    "Response": "00",
    "ExtendedDescription": "Transaccion aprobada",
    "clearingInstituteName": "Datafast"
  },
  "customer": {
    "merchantCustomerId": "merchant-xxxx-xxxx-43",
    "email": "user@example.com",
    "givenName": "John",
    "surname": "Doe"
  },
  "customParameters": {
    "SHOPPER_VAL_BASE0": "0.00",
    "SHOPPER_VAL_BASEIMP": "28.00",
    "SHOPPER_VAL_IVA": "0.00"
  }
}
```

## Field Mapping to Test Script

| Script Column        | JSON Path                                        | Example Value                                          | Notes                      |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------ | -------------------------- |
| CustomerId           | `customer.merchantCustomerId`                    | merchant-xxxx-xxxx-43                                  | First 16 chars of user_id  |
| ID (JSON RESPUESTA)  | `id`                                             | 8ac7a4a199ff8eb2019a032fa3a15b88                       | Main transaction ID        |
| Meses Plazo          | N/A (config)                                     | 0                                                      | 0 for current credit       |
| Tipo Transaccion     | N/A (config)                                     | En Linea                                               | Always "En Linea" (Online) |
| Tarjeta              | `resultDetails.CardType`                         | MP                                                     | MP = Visa Pacífico         |
| **Lote (P-38)**      | `resultDetails.BatchNo`                          | 251020                                                 | ✅ From ReferenceNbr       |
| **Referencia (P-4)** | `resultDetails.ReferenceNbr`                     | 251020_000083                                          | ✅ KEY FIELD               |
| Autorizacion (P-59)  | `resultDetails.AuthCode`                         | 661777                                                 | Authorization code         |
| Valor                | `amount`                                         | 28.00                                                  | Total amount               |
| Base 0               | `customParameters.SHOPPER_VAL_BASE0`             | 0.00                                                   | Tax base 0%                |
| Base 12              | `customParameters.SHOPPER_VAL_BASEIMP`           | 28.00                                                  | Tax base 12% (IVA)         |
| Iva                  | `customParameters.SHOPPER_VAL_IVA`               | 0.00                                                   | IVA amount                 |
| Servicio             | N/A                                              | 0.00                                                   | Service charge             |
| Interes              | `resultDetails.Interest`                         | 0.00                                                   | Interest (for deferred)    |
| Gran Total           | `resultDetails.TotalAmount`                      | 28.00                                                  | Total including interest   |
| Observaciones        | `resultDetails.ExtendedDescription` + `Response` | Transaccion aprobada - Response: 00 - AcquirerCode: 01 |                            |

## ✅ Verification Checklist

- [x] **Lote** comes from `resultDetails.BatchNo` (which is part of ReferenceNbr)
- [x] **Referencia** comes from `resultDetails.ReferenceNbr` (complete reference)
- [x] All monetary values come from JSON response
- [x] Customer ID comes from `merchantCustomerId` (first 16 chars)
- [x] Transaction ID comes from root `id` field
- [x] Authorization code comes from `resultDetails.AuthCode`
- [x] Card type comes from `resultDetails.CardType`
- [x] Tax breakdown comes from `customParameters.SHOPPER_VAL_*`

## ReferenceNbr Breakdown

The `ReferenceNbr` field contains both pieces of information:

```text
ReferenceNbr = "251020_000083"
               ^^^^^^ ^^^^^^
               |      |
               |      └─ ReferenceNo (000083)
               └──────── BatchNo (251020)
```

Format: `{BatchNo}_{ReferenceNo}`

This is the standard format that Datafast uses to combine:

- **Batch Number (Lote):** Date-based batch identifier (YYMMDD format)
- **Reference Number:** Sequential transaction number within that batch

## Example from User Transaction

**JSON Response:**

```json
"resultDetails": {
  "BatchNo": "251020",
  "ReferenceNo": "000083",
  "ReferenceNbr": "251020_000083"
}
```

**Script Entry:**

```csv
Lote: 251020
Referencia: 251020_000083
```

## Additional Notes

1. **P-11, P-38, P-4, P-59, P-54, P-57** are Datafast field codes referring to specific data points in their system.

2. All our transactions use:

   - **Result Code:** 000.100.112 (Test Mode Success)
   - **Response:** 00 (Approved)
   - **AcquirerCode:** 01 (Pacificard)
   - **CardType:** MP (Visa Pacífico)

3. The test card used: **4200 0000 0000 0000** (ending in 0000)

4. **Tax Structure:** All transactions send:

   - BASE0: $0.00
   - BASEIMP: Full amount
   - IVA: $0.00

   This indicates you're treating all ticket sales as taxable base with 0% IVA applied.

## Compliance Status

✅ **COMPLIANT** - The test script correctly uses data from the JSON response, specifically using the `ReferenceNbr` field as required by Datafast's documentation.

---

**Document Version:** 1.0  
**Last Updated:** October 20, 2025  
**Purpose:** Verification for Datafast Phase 2 Certification
