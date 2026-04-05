-- ============================================================
-- Associate all active products with both stores
-- ============================================================

INSERT INTO store_products (store_id, product_id, stock_quantity, is_available)
SELECT s.id, p.id, 10, true
FROM stores s
CROSS JOIN products p
WHERE p.is_active = true
  AND s.is_active = true
ON CONFLICT (store_id, product_id) DO NOTHING;
