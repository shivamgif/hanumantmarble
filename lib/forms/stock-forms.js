import { z } from "zod"

const numericText = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return ""
    return String(value).trim()
  })

export const arrivalItemSchema = z.object({
  itemId: z.string().optional().default(""),
  itemName: z.string().min(1, "Item name is required"),
  brandName: z.string().optional().default(""),
  divisionName: z.string().optional().default(""),
  finish: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  sizeLabel: z.string().optional().default(""),
  sizeUnit: z.string().optional().default("mm"),
  hsnCode: z.string().optional().default(""),
  thicknessMm: numericText,
  qtySqm: numericText,
  costPerSqm: numericText,
  piecesPerBox: numericText,
  reorderLevel: numericText,
  description: z.string().optional().default(""),
  orderedBoxes: numericText,
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

  if (!item.itemId && (!item.itemName || !item.brandName || !item.sizeLabel)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter item name, brand, and size for a new tile.",
      path: ["itemName"],
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
  supplierName: z.string().optional().default(""),
  truckLicensePlate: z.string().optional().default(""),
  driverName: z.string().optional().default(""),
  invoiceNumber: z.string().optional().default(""),
  invoiceDate: z.string().optional().default(""),
  originCity: z.string().optional().default(""),
  destinationWarehouseName: z.string().optional().default(""),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).default("unpaid"),
  paidAmount: numericText,
  paymentDate: z.string().optional().default(""),
  paymentReference: z.string().optional().default(""),
  paymentMode: z.string().optional().default(""),
  transporterName: z.string().optional().default(""),
  transportCost: numericText,
  laborCost: numericText,
  handlingCostPercent: numericText,
  fuelCostPercent: numericText,
  gstPercent: numericText,
  freightWeightKg: numericText,
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
