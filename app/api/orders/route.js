import { NextResponse } from "next/server";
import { Parser } from "json2csv";

const SHOPIFY_API_VERSION = process.env.YEAR || process.env.SHOPIFY_API_VERSION;

function getRingSize(lineItem) {
  if (!lineItem.properties || !Array.isArray(lineItem.properties)) {
    return "";
  }
  const sizeProperty = lineItem.properties.find((prop) => prop.name === "Size");
  if (sizeProperty && sizeProperty.value) {
    return sizeProperty.value;
  }
  const skuWithSizeProperty = lineItem.properties.find(
    (prop) => prop.name === "_SKU with size"
  );
  if (skuWithSizeProperty && skuWithSizeProperty.value) {
    return skuWithSizeProperty.value;
  }
  return "";
}

function getAccessToken(store) {
  if (store.includes("enchanted-jewelry-uk")) {
    return process.env.SHOPIFY_ACCESS_TOKEN_EDFJ_UK;
  }
  if (store.includes("enchanted")) {
    return process.env.SHOPIFY_ACCESS_TOKEN_EDFJ;
  }
  if (store.includes("starwars")) {
    return process.env.SHOPIFY_ACCESS_TOKEN_SWFJ;
  }
  return null;
}

async function fetchAllOrders(store, startDate, endDate) {
  const accessToken = getAccessToken(store);
  if (!accessToken) {
    throw new Error(`No access token configured for store: ${store}`);
  }

  let orders = [];
  let nextPageUrl = `https://${store}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/orders.json?created_at_min=${startDate}T00:00:00Z&created_at_max=${endDate}T23:59:59Z&status=any&limit=250`;

  while (nextPageUrl) {
    const response = await fetch(nextPageUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    orders = orders.concat(data.orders || []);

    const linkHeader = response.headers.get("link");
    const nextPageMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
    nextPageUrl = nextPageMatch ? nextPageMatch[1] : null;
  }

  return orders;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { store, startDate, endDate, exportWithLineItemProperties } = body;

    if (!store || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Store, Start date and end date are required" },
        { status: 400 }
      );
    }

    const orders = await fetchAllOrders(store, startDate, endDate);

    if (!orders.length) {
      return NextResponse.json(
        { message: "No orders found in the selected range" },
        { status: 404 }
      );
    }

    const allOrdersData = [];
    const fulfilledOrdersData = [];

    orders.forEach((order) => {
      order.fulfillments?.forEach((fulfillment) => {
        fulfillment.line_items.forEach((lineItem) => {
          const row = {
            Name: order.name,
            Email: order.email,
            "Financial Status": order.financial_status,
            "Paid at": order.processed_at,
            "Fulfillment Status": order.fulfillment_status,
            "Fulfilled at": fulfillment?.created_at ?? "",
            Currency: order.currency,
            Subtotal: order.subtotal_price,
            Shipping:
              order.shipping_lines?.reduce(
                (sum, ship) => sum + parseFloat(ship.price || 0),
                0
              ) ?? 0,
            Taxes: order.total_tax ?? 0,
            Total: order.total_price,
            "Discount Amount": order.total_discounts ?? 0,
            "Order Created at": order.created_at,
            "Lineitem quantity": lineItem.quantity,
            "Lineitem name": lineItem.name,
            "Lineitem price": lineItem.price,
            "Lineitem sku": lineItem.sku ?? "",
            ...(exportWithLineItemProperties && {
              "Ring Size": getRingSize(lineItem),
            }),
            "Lineitem fulfillment status":
              lineItem.fulfillment_status ?? "unfulfilled",
            "Fulfilled date": fulfillment.created_at,
            "Delivery data": fulfillment?.updated_at ?? "",
            "Shipping Staus": "",
            "Tracking No": fulfillment.tracking_number ?? "",
            "Shipping Name": order.shipping_address?.name ?? "",
            "Shipping Street": order.shipping_address?.address1 ?? "",
            "Shipping Address1": order.shipping_address?.address1 ?? "",
            "Shipping Address2": order.shipping_address?.address2 ?? "",
            "Shipping Company": order.shipping_address?.company ?? "",
            "Shipping City": order.shipping_address?.city ?? "",
            "Shipping Zip": order.shipping_address?.zip ?? "",
            "Shipping Province": order.shipping_address?.province ?? "",
            "Shipping Country": order.shipping_address?.country ?? "",
            "Shipping Phone": order.shipping_address?.phone ?? "",
            "Payment Method":
              order.payment_gateway_names?.join(", ") ?? "",
            Tags: order.tags ?? "",
            "Risk Level": order.risk_level ?? "",
            Source: order.source_name ?? "",
            "Lineitem discount": lineItem.total_discount ?? "",
          };

          allOrdersData.push(row);
          if (order.fulfillment_status === "fulfilled") {
            fulfilledOrdersData.push(row);
          }
        });
      });
    });

    if (allOrdersData.length === 0) {
      return NextResponse.json(
        { message: "No order/fulfillment data to export" },
        { status: 404 }
      );
    }

    const parser = new Parser({ fields: Object.keys(allOrdersData[0]) });
    const csv = parser.parse(allOrdersData);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=shopify_orders.csv`,
      },
    });
  } catch (error) {
    console.error("Error processing orders:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
