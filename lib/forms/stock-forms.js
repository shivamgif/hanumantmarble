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
  sizeLabel: requiredText,
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
  loadedBrokenQty: numericText,
  notes: z.string().optional().default(""),
}).superRefine((item, ctx) => {
  const hasWhole = Number(item.loadedWholeQty || 0) > 0
  const hasBroken = Number(item.loadedBrokenQty || 0) > 0
  if (!hasWhole && !hasBroken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter whole or broken quantity for each dispatch row.",
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
  shipmentNumber: z.string().optional().default(""),
  customerName: z.string().min(1, "Customer name is required"),
  truckLicensePlate: z.string().optional().default(""),
  driverName: z.string().optional().default(""),
  invoiceNumber: z.string().optional().default(""),
  salespersonName: z.string().optional().default(""),
  dispatchDate: z.string().optional().default(""),
  transportCost: numericText,
  laborCost: numericText,
  notes: z.string().optional().default(""),
  items: z.array(dispatchItemSchema).min(1, "Add at least one dispatch item."),
})
