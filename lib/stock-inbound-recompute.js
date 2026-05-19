import { sql } from '@/lib/db';
import { getStockSchemaCapabilities } from '@/lib/stock-db-compat';
import { computeInboundTotals } from '@/lib/stock-pricing';

export async function recomputeInboundShipmentTotals(shipmentId) {
  const schemaCaps = await getStockSchemaCapabilities();
  const shipmentRows = await sql(
    `SELECT handling_cost_percent, fuel_cost_percent, gst_percent, discount_amount
     FROM stock_inbound_shipments
     WHERE id = $1
     LIMIT 1`,
    [shipmentId]
  );
  const shipment = shipmentRows[0] || {};
  const itemRows = await sql(
    `SELECT isi.id,
            isi.item_id,
            isi.ordered_qty,
            isi.ordered_qty_sqm,
            isi.unit_cost,
            isi.cost_per_sqm,
            isi.total_cost,
            isi.discount_amount,
            ${schemaCaps.hasStockItemsRatePerBag ? 'i.rate_per_bag AS master_rate_per_bag' : 'NULL AS master_rate_per_bag'}
     FROM stock_inbound_shipment_items isi
     JOIN stock_items i ON i.id = isi.item_id
     WHERE isi.inbound_shipment_id = $1
     ORDER BY isi.id ASC`,
    [shipmentId]
  );

  const pricing = computeInboundTotals({
    items: itemRows.map((item) => {
      const orderedSqm = Number(item.ordered_qty_sqm || 0);
      const orderedQty = Number(item.ordered_qty || 0);
      const costPerSqm = Number(item.cost_per_sqm || 0);
      const unitCost = Number(item.unit_cost || item.master_rate_per_bag || 0);
      const computedGross = orderedSqm > 0 && costPerSqm > 0
        ? Number((orderedSqm * costPerSqm).toFixed(2))
        : Number((orderedQty * unitCost).toFixed(2));
      const lineGross = computedGross > 0 ? computedGross : Number(item.total_cost || 0);
      const storedDiscount = Number(item.discount_amount || 0);
      // Corruption guard: discount equal to or exceeding gross is poisoned data; reset.
      const discountAmount = lineGross > 0 && storedDiscount >= lineGross ? 0 : storedDiscount;
      return {
        existing: item,
        lineGross,
        discountAmount,
      };
    }),
    discountAmount: (() => {
      const stored = Number(shipment.discount_amount || 0);
      const subtotal = itemRows.reduce((s, it) => {
        const sqm = Number(it.ordered_qty_sqm || 0);
        const cps = Number(it.cost_per_sqm || 0);
        const qty = Number(it.ordered_qty || 0);
        const uc = Number(it.unit_cost || it.master_rate_per_bag || 0);
        return s + (sqm > 0 && cps > 0 ? sqm * cps : qty * uc);
      }, 0);
      return subtotal > 0 && stored >= subtotal ? 0 : stored;
    })(),
    fuelPct: Number(shipment.fuel_cost_percent ?? 5.0),
    handlingPct: Number(shipment.handling_cost_percent ?? 1.0),
    gstPct: Number(shipment.gst_percent ?? 18.0),
  });

  for (const priced of pricing.lines) {
    const item = priced.existing;
    const qtyBasis = Number(item.ordered_qty_sqm || 0) > 0
      ? Number(item.ordered_qty_sqm)
      : Number(item.ordered_qty || 0);
    const fallbackCost = Number(item.cost_per_sqm || item.unit_cost || 0);
    const landedCost = qtyBasis > 0 ? Number((priced.effectiveLineCost / qtyBasis).toFixed(2)) : fallbackCost;
    const resolvedUnitCost = Number(item.unit_cost || item.master_rate_per_bag || 0);

    await sql(
      `UPDATE stock_inbound_shipment_items
       SET discount_amount = $1,
           landed_cost = $2,
           total_cost = $4,
           unit_cost = CASE
             WHEN COALESCE(ordered_qty_sqm, 0) <= 0 THEN $5
             ELSE unit_cost
           END,
           updated_at = NOW()
       WHERE id = $3`,
      [priced.lineDiscount, landedCost, item.id, priced.lineGross, resolvedUnitCost]
    );
    await sql(
      `UPDATE stock_inventory_lots
       SET landed_cost = $1
       WHERE source_type = 'purchase'
         AND source_table = 'stock_inbound_shipments'
         AND source_id = $2
         AND item_id = $3`,
      [landedCost, shipmentId, item.item_id]
    );
    await sql(`UPDATE stock_items SET landed_cost = $1, updated_at = NOW() WHERE id = $2`, [landedCost, item.item_id]);
  }

  const rows = await sql(
    `UPDATE stock_inbound_shipments
     SET grand_total = $1,
         discount_amount = $3,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [pricing.grandTotal, shipmentId, pricing.shipmentDiscount]
  );

  return rows[0] || null;
}
