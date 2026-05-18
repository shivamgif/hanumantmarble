// Pure pricing math for inbound shipments. Reused by POST + PATCH so formula
// stays in one place. See Workstream E plan for derivation.

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

export function computeInboundTotals({ items, discountAmount = 0, fuelPct = 0, handlingPct = 0, gstPct = 0 }) {
  const safeItems = Array.isArray(items) ? items : [];

  // 1. Line totals net of line-level discount
  const lineRows = safeItems.map((it) => {
    const lineGross = n(it.lineGross);
    const lineDiscount = Math.min(n(it.discountAmount), lineGross);
    const lineNet = lineGross - lineDiscount;
    return { ...it, lineGross, lineDiscount, lineNet };
  });
  const subtotalAfterLineDisc = lineRows.reduce((s, r) => s + r.lineNet, 0);

  // 2. Shipment-level discount (capped at remaining subtotal)
  const shipmentDiscountInput = Math.max(0, n(discountAmount));
  const shipmentDiscount = Math.min(shipmentDiscountInput, subtotalAfterLineDisc);
  const discountedSubtotal = subtotalAfterLineDisc - shipmentDiscount;

  // 3. Pro-rate shipment discount across lines for landed_cost
  const proRate = subtotalAfterLineDisc > 0 ? shipmentDiscount / subtotalAfterLineDisc : 0;
  const linesWithLanded = lineRows.map((r) => {
    const proRatedDiscount = r.lineNet * proRate;
    const effectiveLineCost = r.lineNet - proRatedDiscount;
    return { ...r, proRatedDiscount, effectiveLineCost };
  });

  // 4. Apply percentage cascade on discounted subtotal
  const fuel = n(fuelPct);
  const handling = n(handlingPct);
  const gst = n(gstPct);
  const afterFuel = discountedSubtotal * (1 + fuel / 100);
  const afterHandling = afterFuel * (1 + handling / 100);
  const grandTotal = Number((afterHandling * (1 + gst / 100)).toFixed(2));

  return {
    lines: linesWithLanded,
    subtotalAfterLineDisc: Number(subtotalAfterLineDisc.toFixed(2)),
    shipmentDiscount: Number(shipmentDiscount.toFixed(2)),
    discountedSubtotal: Number(discountedSubtotal.toFixed(2)),
    grandTotal,
  };
}
