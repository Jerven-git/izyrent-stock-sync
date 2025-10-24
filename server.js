import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const { SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD, SHOPIFY_STORE_DOMAIN } = process.env;

// 🔔 Webhook endpoint for new orders
app.post("/webhook/order-create", async (req, res) => {
  try {
    const order = req.body;
    console.log(`📦 Order received: ${order.id}`);

    for (const item of order.line_items) {
      const variantTitle = item.title; // e.g. "Small / Pickup"
      const productId = item.product_id;

      if (variantTitle.includes("Pickup")) {
        await syncOppositeVariant(productId, variantTitle, "Postage");
      } else if (variantTitle.includes("Postage")) {
        await syncOppositeVariant(productId, variantTitle, "Pickup");
      }
    }

    res.status(200).send("ok");
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).send("error");
  }
});

// 🔄 Function to find and update opposite variant
async function syncOppositeVariant(productId, currentTitle, oppositeMethod) {
  const baseTitle = currentTitle.split("/")[0].trim(); // Extract size part e.g. "Small"
  const oppositeTitle = `${baseTitle} / ${oppositeMethod}`;

  const variantsUrl = `https://${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}@${SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/products/${productId}/variants.json`;
  const variantsRes = await fetch(variantsUrl);
  const { variants } = await variantsRes.json();

  const oppositeVariant = variants.find(v => v.title.trim() === oppositeTitle);

  if (!oppositeVariant) {
    console.log(`⚠️ No opposite variant found for ${oppositeTitle}`);
    return;
  }

  console.log(`🔄 Updating opposite variant: ${oppositeTitle}`);

  const inventorySetUrl = `https://${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}@${SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/inventory_levels/set.json`;

  await fetch(inventorySetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location_id: (await getLocationId()),
      inventory_item_id: oppositeVariant.inventory_item_id,
      available: 0
    })
  });

  console.log(`✅ ${oppositeTitle} stock set to 0`);
}

// 🏬 Helper: Get store location ID (needed for inventory updates)
async function getLocationId() {
  const url = `https://${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}@${SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/locations.json`;
  const res = await fetch(url);
  const data = await res.json();
  return data.locations[0].id; // Use first location
}

app.listen(process.env.PORT, () => {
  console.log(`🚀 IzyRent Stock Sync running on port ${process.env.PORT}`);
});