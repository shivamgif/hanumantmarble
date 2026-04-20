import { z } from "zod"

const numericText = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return ""
    return String(value).trim()
  })

const requiredNumericText = numericText.refine(
  (value) => value !== "" && Number.isFinite(Number(value)),
  { message: "Required" }
)

const requiredText = z.string().trim().min(1, "Required")

export const arrivalItemSchema = z.object({
  itemId: z.string().optional().default(""),
  itemName: requiredText,
  brandName: requiredText,
  divisionName: requiredText,
  finish: requiredText,
  grade: requiredText,
  sizeLabel: z.string().optional().default(""),
  sizeWidthMm: requiredNumericText,
  sizeLengthMm: requiredNumericText,
  sizeUnit: z.string().optional().default("mm"),
  hsnCode: requiredText,
  thicknessMm: requiredNumericText,
  qtySqm: numericText,
  costPerSqm: requiredNumericText,
  piecesPerBox: requiredNumericText,
  reorderLevel: numericText,
  description: z.string().optional().default(""),
  orderedBoxes: requiredNumericText,
  wholeQty: numericText,
  brokenQty: numericText,
  notes: z.string().optional().default(""),
}).superRefine((item, ctx) => {
  const hasWhole = Number(item.wholeQty || 0) > 0
  const hasBroken = Number(item.brokenQty || 0) > 0
  if (!hasWhole && !hasBroken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter whole or broken quantity for each purchase row.",
      path: ["wholeQty"],
    })
  }
})

export const dispatchItemSchema = z.object({
  itemId: z.string().min(1, "Select a stock item"),
  loadedWholeQty: numericText,
  // loadedBrokenQty removed, replaced by return fields
  notes: z.string().optional().default(""),
  // These are not editable by stock_maintainer, only admin/manager (enforced in UI, not schema)
  returnWholeQty: numericText.optional().default(""),
  returnBrokenQty: numericText.optional().default(""),
}).superRefine((item, ctx) => {
  const hasWhole = Number(item.loadedWholeQty || 0) > 0
  // No loadedBrokenQty, only loadedWholeQty is required for dispatch
  if (!hasWhole) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter whole quantity for each dispatch row.",
      path: ["loadedWholeQty"],
    })
  }
})

export const arrivalFormSchema = z.object({
  shipmentNumber: z.string().optional().default(""),
  supplierName: requiredText,
  truckLicensePlate: requiredText,
  driverName: requiredText,
  invoiceNumber: requiredText,
  invoiceDate: requiredText,
  originCity: requiredText,
  destinationWarehouseName: requiredText,
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).default("unpaid"),
  paidAmount: numericText,
  paymentDate: z.string().optional().default(""),
  paymentReference: z.string().optional().default(""),
  paymentMode: z.string().optional().default(""),
  transporterName: requiredText,
  transportCost: requiredNumericText,
  laborCost: requiredNumericText,
  handlingCostPercent: requiredNumericText,
  fuelCostPercent: requiredNumericText,
  gstPercent: requiredNumericText,
  freightWeightKg: requiredNumericText,
  notes: z.string().optional().default(""),
  items: z.array(arrivalItemSchema).min(1, "Add at least one purchase item."),
}).superRefine((form, ctx) => {
  const requiresPaymentDetails = form.paymentStatus === "partial" || form.paymentStatus === "paid"

  if (requiresPaymentDetails && Number(form.paidAmount || 0) <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter the paid amount.",
      path: ["paidAmount"],
    })
  }

  if (requiresPaymentDetails && !form.paymentDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select the payment date.",
      path: ["paymentDate"],
    })
  }

  if (form.paymentStatus === "paid" && !form.paymentMode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter the payment mode.",
      path: ["paymentMode"],
    })
  }
})

export const dispatchFormSchema = z.object({
  shipmentNumber: z.string()
    .optional()
    .default("")
    .refine((val) => !val || /^[A-Za-z0-9/_-]+$/.test(val), { message: "Only letters, numbers, /, - or _ allowed" }),
  customerName: z.string().trim().min(1, "Customer name is required"),
  customerPhoneNumber: z.string()
    .default("")
    .refine(
      (val) => !val || /^\+?[\d\s()\-]{10,15}$/.test(val),
      { message: "Enter a valid phone number (10–15 digits)" }
    ),
  truckLicensePlate: z.string().trim().min(1, "Truck license plate is required")
    .refine((val) => /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{1,4}$/i.test(val), {
      message: "Enter a valid license plate (e.g. RJ 14 XY 0000)",
    }),
  driverName: z.string().trim().min(1, "Driver name is required")
    .refine((val) => /^[A-Za-z\s.'-]{2,}$/.test(val), { message: "Enter a valid driver name" }),
  invoiceNumber: z.string().trim().min(1, "Invoice number is required")
    .refine((val) => /^[A-Za-z0-9/_-]+$/.test(val), { message: "Only letters, numbers, /, - or _ allowed" }),
  salespersonName: z.string().optional().default(""),
  dispatchDate: z.string().min(1, "Dispatch date is required"),
  transportCost: numericText,
  laborCost: numericText,
  notes: z.string().optional().default(""),
  items: z.array(dispatchItemSchema).min(1, "Add at least one dispatch item."),
})
